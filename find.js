let findSelected = null, findAnimation = null;
const findDrafts = new Map();
// 터치 기기에서는 안내 문구의 '클릭'을 '탭'으로 바꿉니다.
const FIND_TAP = IS_TOUCH ? '탭' : '클릭';
function openFind() {
  openWriting('find');
  document.body.classList.add('is-find');
  writingElements.view.setAttribute('aria-label','F 발견하기');
  document.querySelector('.writing-prompt').innerHTML = '아카이브에서 찾은 메모에<br>새로운 영감을 넣어보세요';
  findSelected = null;
  writingElements.input.value = '';
  writingElements.input.disabled = true;
  writingElements.input.placeholder = '왼쪽에서 메모 카드를 골라주세요';
  renderFindArchive();
}
function renderFindArchive() {
  const grid = document.getElementById('findArchive'); grid.replaceChildren();
  const notes = shuffleMemories(writingNotes);
  if (!notes.length) {
    const empty = document.createElement('p'); empty.className = 'find-empty';
    empty.textContent = '아직 저장된 기록이 없어요. W 기록하기에서 첫 메모를 남겨주세요.'; grid.append(empty);
  }
  notes.forEach((note,index) => {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'find-card';
    card.setAttribute('aria-label',`${overlayDate(note.date)} — ${index + 1}번째 카드 뒤집기`);
    card.setAttribute('aria-pressed','false');
    const inner = document.createElement('span'); inner.className = 'find-card-inner';
    const date = document.createElement('span'); date.className = 'find-card-date'; date.textContent = overlayDate(note.date);
    const content = document.createElement('span'); content.className = 'find-card-content'; content.textContent = note.text; content.setAttribute('aria-hidden','true');
    inner.append(date,content); card.append(inner);
    card.addEventListener('click',()=>selectFindNote(note,card)); grid.append(card);
  });
  document.getElementById('findStatus').textContent = notes.length ? `카드를 ${FIND_TAP}해 내용을 확인하고, 한 번 더 ${FIND_TAP}해 이어 써보세요.` : '';
}
async function selectFindNote(note,card) {
  if (findAnimation || writingSaving) return;
  if (!card.classList.contains('is-revealed')) {
    card.classList.add('is-revealed');
    card.querySelector('.find-card-content').removeAttribute('aria-hidden');
    card.querySelector('.find-card-date').setAttribute('aria-hidden','true');
    card.setAttribute('aria-label',`${overlayDate(note.date)} — 다시 ${FIND_TAP}해서 이어쓰기`);
    document.getElementById('findStatus').textContent = `내용을 확인한 카드를 한 번 더 ${FIND_TAP}하면 오른쪽에서 이어 쓸 수 있어요.`;
    return;
  }
  if (findSelected) findDrafts.set(findSelected,writingElements.input.value);
  // 고른 카드를 바로 표시해, 날아가는 동안에도 어느 카드인지 보이게 합니다.
  document.querySelectorAll('.find-card').forEach(item=>item.setAttribute('aria-pressed',String(item===card)));
  // 카드를 늘리는 대신 크기·여백·글자 크기를 함께 옮겨, 글자가 찌그러지지 않고 작성란 글자 그대로 도착합니다.
  const start = card.getBoundingClientRect(), end = writingElements.paper.getBoundingClientRect();
  const startStyle = getComputedStyle(card.querySelector('.find-card-content'));
  const input = writingElements.input, inputBox = input.getBoundingClientRect(), inputStyle = getComputedStyle(input);
  const endPad = [
    inputBox.top - end.top + parseFloat(inputStyle.borderTopWidth) + parseFloat(inputStyle.paddingTop),
    end.right - inputBox.right + parseFloat(inputStyle.paddingRight),
    end.bottom - inputBox.bottom,
    inputBox.left - end.left + parseFloat(inputStyle.paddingLeft)
  ].map(value=>`${Math.max(0,value)}px`).join(' ');
  const flyer = document.createElement('div'); flyer.className = 'find-flyer find-flyer-front'; flyer.setAttribute('aria-hidden','true');
  flyer.textContent = note.text; document.body.append(flyer);
  input.disabled = true;
  const animation = flyer.animate([
    {left:`${start.left}px`,top:`${start.top}px`,width:`${start.width}px`,height:`${start.height}px`,padding:startStyle.padding,fontSize:startStyle.fontSize,lineHeight:startStyle.lineHeight,borderRadius:startStyle.borderTopLeftRadius},
    {left:`${end.left}px`,top:`${end.top}px`,width:`${end.width}px`,height:`${end.height}px`,padding:endPad,fontSize:inputStyle.fontSize,lineHeight:inputStyle.lineHeight,borderRadius:getComputedStyle(writingElements.paper).borderRadius}
  ],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:340,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
  findAnimation = {animation,flyer};
  try {await animation.finished;} catch (_) {return;}
  flyer.remove(); findAnimation = null;
  findSelected = note;
  writingElements.input.disabled = false;
  writingElements.input.placeholder = '';
  writingElements.input.value = findDrafts.get(note) ?? `${note.text}\n\n`;
  setWritingDate(todayForWriting());
  writingElements.input.focus({preventScroll:true});
  writingElements.input.setSelectionRange(writingElements.input.value.length,writingElements.input.value.length);
  writingElements.input.scrollTop = writingElements.input.scrollHeight;
  document.getElementById('findStatus').textContent = `선택한 기록에 이어서 작성하세요. ${IS_TOUCH ? '저장하기를 탭하면' : 'Enter로'} 새 기록을 저장합니다.`;
}
function resetFindAfterSave() {
  findDrafts.delete(findSelected); findSelected = null;
  writingElements.input.disabled = true; writingElements.input.placeholder = '다음 메모 카드를 골라주세요';
  renderFindArchive();
  document.getElementById('findStatus').textContent = '새 기록을 저장했어요. 다른 카드를 발견해보세요.';
}
function cleanupFind() {
  if (findSelected) findDrafts.set(findSelected,writingElements.input.value);
  if (findAnimation) {findAnimation.animation.cancel();findAnimation.flyer.remove();findAnimation=null;}
  findSelected = null; writingElements.input.disabled = false; writingElements.input.placeholder = '';
  document.body.classList.remove('is-find');
}
