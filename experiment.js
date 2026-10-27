// E 실험하기: 손잡이를 당겨 세 줄의 슬롯을 돌리고, 서로 다른 시기의 기록을 한 화면에 모읍니다.
// 핀으로 고정한 줄은 그대로 두고 나머지만 다시 돌립니다(Keep & Reroll).
const REEL_COUNT = 3;
const PIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"/><path d="M12 14v7"/></svg>';
let experimentReels = [], experimentSpinning = false, experimentRun = 0;

function openExperiment() {
  writingMode = 'experiment'; writingOpen = true;
  document.body.classList.add('is-writing', 'is-experiment');
  document.getElementById('experimentView').hidden = false;
  const empty = !writingNotes.length;
  document.getElementById('experimentEmpty').hidden = !empty;
  document.querySelector('.experiment-stage').hidden = empty;
  experimentReels = [];
  renderExperimentReels();
  if (empty) { document.getElementById('experimentClose').focus({preventScroll: true}); return; }
  setExperimentStatus(`마음에 드는 기록은 핀으로 고정하고, ${IS_TOUCH ? '손잡이를 당겨' : '손잡이를 당기거나 Space로'} 나머지를 다시 돌려보세요.`);
  spinExperiment();
}

function closeExperiment() {
  experimentRun++;
  experimentReels.forEach(reel => reel.animation?.cancel());
  experimentSpinning = false;
  writingOpen = false;
  document.body.classList.remove('is-writing', 'is-experiment');
  document.getElementById('experimentView').hidden = true;
  document.querySelector('.instruction').hidden = false;
  document.querySelector('.face-button[data-face="5"]').focus({preventScroll: true});
}

function randomNote() { return writingNotes[Math.floor(Math.random() * writingNotes.length)]; }
function randomNotes(count) { return Array.from({length: count}, randomNote); }

// 슬롯은 항상 다섯 칸(위 두 칸, 가운데, 아래 두 칸)으로 정지하고, 화면에는 가운데와 위아래 일부만 보입니다.
function renderExperimentReels() {
  const container = document.getElementById('experimentReels');
  container.replaceChildren();
  if (!writingNotes.length) return;
  for (let i = 0; i < REEL_COUNT; i++) {
    const row = document.createElement('div'); row.className = 'reel';
    const pin = document.createElement('button');
    pin.type = 'button'; pin.className = 'reel-pin'; pin.innerHTML = PIN_ICON; pin.title = '고정';
    pin.setAttribute('aria-pressed', 'false'); pin.setAttribute('aria-label', `${i + 1}번째 기록 고정`);
    const view = document.createElement('div'); view.className = 'reel-window';
    const strip = document.createElement('div'); strip.className = 'reel-strip';
    view.append(strip); row.append(pin, view); container.append(row);
    view.tabIndex = 0; view.setAttribute('role', 'button'); view.setAttribute('aria-label', `${i + 1}번째 기록 크게 보기`);
    const items = randomNotes(5);
    const reel = {items, note: items[2], kept: false, row, view, strip, pin, animation: null};
    pin.addEventListener('click', () => toggleReelKeep(reel));
    view.addEventListener('click', () => openReelDetail(reel));
    view.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openReelDetail(reel); } });
    setReelStrip(reel, items);
    experimentReels.push(reel);
  }
}

// 룰렛 칸이 좁아 다 못 읽는 메모는 눌러서 룰렛 묶음 크기로 펼쳐 보고, 다시 누르면 접습니다.
function openReelDetail(reel) {
  if (experimentSpinning || !reel.note) return;
  closeReelDetail();
  const detail = document.createElement('div'); detail.className = 'reel-detail'; detail.tabIndex = 0;
  detail.setAttribute('role', 'button'); detail.setAttribute('aria-label', '다시 눌러 룰렛으로 돌아가기');
  const date = document.createElement('span'); date.className = 'reel-detail-date'; date.textContent = overlayDate(reel.note.date);
  const text = document.createElement('p'); text.className = 'reel-detail-text'; text.textContent = reel.note.text;
  detail.append(date, text);
  const close = () => { closeReelDetail(); reel.view.focus({preventScroll: true}); };
  detail.addEventListener('click', close);
  detail.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); close(); } });
  document.getElementById('experimentReels').append(detail);
  detail.focus({preventScroll: true});
}
function closeReelDetail() { document.querySelector('.reel-detail')?.remove(); }

function setReelStrip(reel, notes) {
  reel.strip.replaceChildren(...notes.map((note, index) => {
    const cell = reelCell(note);
    if (index !== 2) cell.setAttribute('aria-hidden', 'true');
    return cell;
  }));
}

function reelCell(note) {
  const cell = document.createElement('div'); cell.className = 'reel-cell';
  const [, month, day] = note.date.split('-');
  const date = document.createElement('span'); date.className = 'reel-date'; date.textContent = `${month}.${day}`;
  date.title = overlayDate(note.date);
  const box = document.createElement('div'); box.className = 'reel-text';
  const text = document.createElement('span'); text.textContent = note.text;
  box.append(text); cell.append(date, box);
  return cell;
}

function toggleReelKeep(reel) {
  reel.kept = !reel.kept;
  reel.row.classList.toggle('is-kept', reel.kept);
  reel.pin.setAttribute('aria-pressed', String(reel.kept));
  reel.pin.title = reel.kept ? '고정 해제' : '고정';
  const free = experimentReels.filter(item => !item.kept).length;
  document.getElementById('experimentLever').disabled = !free;
  setExperimentStatus(free ? `고정하지 않은 ${free}개만 다시 돌아가요.` : '모든 기록을 고정했어요. 이 조합으로 생각을 적어보세요.');
}

// 화면에 보이는 기록과 겹치지 않게 뽑고, 기록이 부족하면 점차 중복을 허용합니다.
function drawExperimentNotes(count) {
  const kept = new Set(experimentReels.filter(reel => reel.kept).map(reel => reel.note));
  const shown = new Set(experimentReels.map(reel => reel.note));
  for (const used of [shown, kept]) {
    const pool = shuffleMemories(writingNotes.filter(note => !used.has(note)));
    if (pool.length >= count) return pool.slice(0, count);
  }
  return randomNotes(count);
}

async function spinExperiment() {
  const targets = experimentReels.filter(reel => !reel.kept);
  if (experimentSpinning || !targets.length) return;
  closeReelDetail();
  experimentSpinning = true;
  const run = experimentRun;
  experimentReels.forEach(reel => reel.pin.disabled = true);
  const picks = drawExperimentNotes(targets.length);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  await Promise.all(targets.map((reel, order) => spinReel(reel, picks[order], order, reduced, run)));
  if (run !== experimentRun) return;
  experimentSpinning = false;
  experimentReels.forEach(reel => reel.pin.disabled = false);
}

// 손잡이가 아래로 젖혀졌다가 튕기듯 돌아오고, 젖혀지는 순간 슬롯이 돌기 시작합니다.
function pullLever() {
  const lever = document.getElementById('experimentLever');
  if (experimentSpinning || lever.disabled || !experimentReels.some(reel => !reel.kept)) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  lever.querySelector('.lever-arm').animate([
    {transform: 'scaleY(1)', easing: 'cubic-bezier(.5,0,.75,0)'},
    {transform: 'scaleY(-.55)', offset: .3},
    {transform: 'scaleY(-.55)', offset: .42, easing: 'cubic-bezier(.3,1.5,.5,1)'},
    {transform: 'scaleY(1)'}
  ], {duration: reduced ? 0 : 750});
  const run = experimentRun;
  setTimeout(() => { if (run === experimentRun) spinExperiment(); }, reduced ? 0 : 220);
}

// 한 칸씩 끊어 넘기며 점점 느려지고, 마지막 칸은 살짝 지나쳤다가 제자리에 멈춥니다.
async function spinReel(reel, note, order, reduced, run) {
  const steps = 8 + order * 4;
  const ending = [randomNote(), randomNote(), note, randomNote(), randomNote()];
  setReelStrip(reel, [...reel.items, ...randomNotes(steps - 5), ...ending]);
  const row = reel.strip.firstElementChild.offsetHeight;
  const duration = reduced ? 0 : 1100 + order * 450;
  const weights = Array.from({length: steps}, (_, i) => 1 + 4 * (i / steps) ** 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const frames = [{transform: 'translateY(0)', offset: 0, easing: 'cubic-bezier(.5,0,.2,1)'}];
  let offset = 0;
  weights.forEach((weight, i) => {
    offset += weight / total;
    frames.push({transform: `translateY(${-(i + 1) * row}px)`, offset: i === steps - 1 ? 1 : offset,
      easing: i === steps - 2 ? 'cubic-bezier(.3,1.6,.5,1)' : 'cubic-bezier(.5,0,.2,1)'});
  });
  if (!reduced) playReelTicks(frames.slice(1).map(frame => frame.offset * duration / 1000));
  reel.animation = reel.strip.animate(frames, {duration, fill: 'forwards'});
  try { await reel.animation.finished; } catch (_) { return; }
  if (run !== experimentRun) return;
  reel.animation.cancel(); reel.animation = null;
  setReelStrip(reel, ending);
  reel.items = ending; reel.note = note;
}

// 칸이 넘어갈 때마다 작은 틱 소리, 멈출 때 조금 더 큰 소리를 냅니다.
function playReelTicks(times) {
  try {
    ensureDiceAudio();
    if (!diceAudio) return;
    const now = diceAudio.currentTime;
    times.forEach((time, i) => playDiceImpact(now + time, i === times.length - 1 ? .12 : .035));
  } catch (_) {}
}

function saveExperiment() {
  const input = document.getElementById('experimentInput');
  if (!input.value.trim()) return;
  const sources = experimentReels.map(reel => reel.note).filter(Boolean);
  writingNotes.push({date: todayForWriting(), text: input.value, savedAt: new Date().toISOString(), mode: 'experiment', sources: sources.map(note => note.savedAt)});
  saveWritingNotes();
  input.value = '';
  setExperimentStatus('새 기록을 저장했어요. 다른 조합도 돌려보세요.');
}

function setExperimentStatus(message) {
  document.getElementById('experimentStatus').textContent = message;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('experimentClose').addEventListener('click', closeExperiment);
  document.getElementById('experimentLever').addEventListener('click', pullLever);
  document.getElementById('experimentSaveHint').addEventListener('click', saveExperiment);
  document.getElementById('experimentInput').addEventListener('keydown', event => {
    // 한글 조합을 확정하는 Enter는 저장으로 처리하지 않습니다. Shift+Enter는 줄바꿈.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (!event.repeat) saveExperiment();
    }
  });
  document.addEventListener('keydown', event => {
    if (!writingOpen || writingMode !== 'experiment' || event.code !== 'Space') return;
    if (['TEXTAREA', 'INPUT', 'BUTTON'].includes(event.target.tagName) || event.target.getAttribute('role') === 'button') return;
    event.preventDefault();
    if (!event.repeat) pullLever();
  });
});
