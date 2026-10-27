// 기록 원본을 변경하지 않고, 방문할 때마다 한 번씩 순서를 섞습니다.
let rememberOrder = [], rememberIndex = 0, rememberMotion = null;
function shuffleMemories(notes) {
  const result = notes.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function openRemember() {
  writingMode = 'remember'; writingOpen = true;
  rememberOrder = shuffleMemories(writingNotes); rememberIndex = 0;
  document.body.classList.add('is-writing', 'is-remember');
  document.getElementById('rememberView').hidden = false;
  renderMemories();
  document.getElementById('rememberDeck').focus({preventScroll:true});
}
function closeRemember() {
  if (rememberMotion) rememberMotion.cancel();
  rememberMotion = null;
  writingOpen = false;
  document.body.classList.remove('is-writing', 'is-remember');
  document.getElementById('rememberView').hidden = true;
  document.querySelector('.instruction').hidden = false;
  document.querySelector('.face-button[data-face="3"]').focus({preventScroll:true});
}
function renderMemories() {
  const deck = document.getElementById('rememberDeck');
  deck.replaceChildren();
  const count = rememberOrder.length;
  for (let depth = Math.min(4, count - 1); depth >= 0; depth--) {
    const note = rememberOrder[(rememberIndex + depth) % count];
    const card = document.createElement('article');
    card.className = 'memory-card'; card.style.setProperty('--depth', depth);
    if (depth) card.setAttribute('aria-hidden', 'true');
    const date = document.createElement('h2'); date.className = 'writing-serif'; date.textContent = overlayDate(note.date);
    const body = document.createElement('div'); body.className = 'memory-body'; body.textContent = note.text;
    const footer = document.createElement('span'); footer.className = 'memory-number'; footer.textContent = `${String((rememberIndex + depth) % count + 1).padStart(2,'0')} / ${String(count).padStart(2,'0')}`;
    const foot = document.createElement('div'); foot.className = 'memory-foot'; foot.append(footer);
    if (!depth) foot.append(memoryDeleteButton(note));
    card.append(date, body, foot); deck.append(card);
    if (!depth) attachMemorySwipe(card);
  }
  if (!count) {
    const empty = document.createElement('article'); empty.className = 'memory-card memory-empty';
    const title = document.createElement('h2'); title.className = 'writing-serif'; title.textContent = '아직 기록이 없어요';
    const body = document.createElement('p'); body.textContent = 'W 기록하기 또는 Ü 중첩하기에서 메모를 저장하면 이곳에서 다시 볼 수 있어요.';
    empty.append(title, body); deck.append(empty);
  }
  document.getElementById('rememberStatus').textContent = count ? `${rememberIndex + 1} / ${count}` : '0 / 0';
  document.querySelectorAll('.memory-nav button').forEach(button => button.disabled = count < 2);
  document.getElementById('rememberHint').textContent = count > 1 ? '좌우로 밀어 기록을 넘겨보세요' : count === 1 ? '첫 번째 기록입니다' : '기록을 남기고 다시 찾아와 주세요';
}
// 삭제: 한 번 누르면 확인 문구로 바뀌고, 3초 안에 한 번 더 누르면 지웁니다.
function memoryDeleteButton(note) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'memory-delete'; button.textContent = '삭제';
  let timer = null;
  button.addEventListener('click', () => {
    if (rememberMotion) return;
    if (!button.classList.contains('is-confirm')) {
      button.classList.add('is-confirm'); button.textContent = '한 번 더 누르면 삭제';
      timer = setTimeout(() => { button.classList.remove('is-confirm'); button.textContent = '삭제'; }, 3000);
      return;
    }
    clearTimeout(timer);
    deleteMemory(note);
  });
  return button;
}
function deleteMemory(note) {
  const index = writingNotes.indexOf(note);
  if (index >= 0) writingNotes.splice(index, 1);
  saveWritingNotes();
  rememberOrder = rememberOrder.filter(item => item !== note);
  if (rememberIndex >= rememberOrder.length) rememberIndex = 0;
  renderMemories();
  document.getElementById('rememberHint').textContent = '기록을 삭제했어요.';
  document.getElementById('rememberDeck').focus({preventScroll:true});
}
async function moveMemory(direction) {
  if (rememberOrder.length < 2 || rememberMotion) return;
  const card = document.querySelector('#rememberDeck .memory-card:last-child');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation = card.animate([{transform:getComputedStyle(card).transform, opacity:1}, {transform:`translateX(${-direction * Math.max(innerWidth * .6, 550)}px) rotate(${-direction * 18}deg)`,opacity:0}], {duration:reduced?0:380,easing:'cubic-bezier(.3,.05,.3,1)',fill:'forwards'});
  rememberMotion = animation;
  try { await animation.finished; } catch (_) { return; }
  if (rememberMotion !== animation) return;
  rememberMotion = null;
  rememberIndex = (rememberIndex + direction + rememberOrder.length) % rememberOrder.length;
  renderMemories();
}
function attachMemorySwipe(card) {
  let drag = null;
  card.addEventListener('pointerdown', event => {
    if (rememberMotion || rememberOrder.length < 2 || event.button !== 0) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,locked:false};
  });
  card.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.locked) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {drag = null; return;}
      if (Math.abs(dx) < 8) return;
      drag.locked = true; card.setPointerCapture(event.pointerId); card.classList.add('is-dragging');
    }
    card.style.transform = `translateX(${dx}px) rotate(${dx * .035}deg)`;
  });
  function finish(event, cancelled = false) {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, locked = drag.locked; drag = null;
    card.classList.remove('is-dragging');
    if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
    if (!cancelled && locked && Math.abs(dx) > Math.min(90, card.clientWidth * .2)) moveMemory(dx < 0 ? 1 : -1);
    else card.style.transform = '';
  }
  card.addEventListener('pointerup', event => finish(event));
  card.addEventListener('pointercancel', event => finish(event, true));
  card.addEventListener('pointerleave', event => {if (drag && !drag.locked) drag = null;});
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('rememberClose').addEventListener('click', closeRemember);
  document.getElementById('memoryPrevious').addEventListener('click', () => moveMemory(-1));
  document.getElementById('memoryNext').addEventListener('click', () => moveMemory(1));
  document.addEventListener('keydown', event => {
    if (!writingOpen || writingMode !== 'remember' || event.isComposing) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); if (!event.repeat) moveMemory(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
});
