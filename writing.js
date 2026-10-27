// 모든 기록은 localStorage에 저장되어 새로고침해도 남습니다.
const WRITING_STORAGE_KEY = 'wuerfel-notes-v1';
const writingNotes = loadWritingNotes();
function loadWritingNotes() {
  try {
    const stored = localStorage.getItem(WRITING_STORAGE_KEY);
    // 처음 방문해 저장한 적이 없으면 발표용 기본 메모(seed-notes.js)로 시작합니다. 모두 삭제한 뒤에는 빈 상태를 유지합니다.
    let saved = stored === null && typeof SEED_NOTES !== 'undefined' ? SEED_NOTES.map(note => ({...note})) : JSON.parse(stored || '[]');
    // 형식이 맞지 않는 항목은 건너뜁니다.
    return Array.isArray(saved) ? saved.filter(note => note && typeof note.text === 'string' && typeof note.date === 'string') : [];
  } catch (_) { return []; }
}
function saveWritingNotes() {
  try { localStorage.setItem(WRITING_STORAGE_KEY, JSON.stringify(writingNotes)); }
  catch (error) { console.warn('기록을 저장하지 못했습니다.', error); }
}
let writingOpen = false;
let writingMode = 'writing';
let overlaySources = [];
const noteDrafts = {writing: null, overlay: null};
let writingSaving = false;
let writingAnimation = null;
let writingElements;

function todayForWriting() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function setWritingDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const [y, m, d] = value.split('-');
  writingElements.date.value = value;
  writingElements.dateButton.textContent = `${y.slice(-2)}년 ${Number(m)}월 ${Number(d)}일의 기록`;
}
function setupWriting() {
  writingElements = {
    view: document.getElementById('writingView'),
    input: document.getElementById('writingInput'),
    paper: document.getElementById('writingPaper'),
    date: document.getElementById('writingDate'),
    dateButton: document.getElementById('writingDateButton'),
    datePanel: document.getElementById('writingDatePanel'),
    stack: document.querySelector('.paper-stack'),
  };
  setWritingDate(todayForWriting());
  document.getElementById('writingClose').addEventListener('click', closeWriting);
  // Enter 외에 저장 안내를 눌러도 저장됩니다(키보드가 없는 터치 기기용).
  document.getElementById('saveHint').addEventListener('click', saveWriting);
  writingElements.dateButton.addEventListener('click', () => {
    const panel = writingElements.datePanel;
    panel.hidden = !panel.hidden;
    writingElements.dateButton.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) writingElements.date.focus();
  });
  writingElements.date.addEventListener('change', () => {
    if (!writingElements.date.value || !writingElements.date.validity.valid) return;
    setWritingDate(writingElements.date.value);
    hideWritingDate();
    writingElements.input.focus({preventScroll: true});
  });
  writingElements.input.addEventListener('keydown', event => {
    // 한글 조합을 확정하는 Enter는 저장으로 처리하지 않습니다. Shift+Enter는 줄바꿈.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (!event.repeat) saveWriting();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && writingOpen && !event.isComposing) {
      event.preventDefault();
      closeCurrentView();
    }
  });
}
function hideWritingDate() {
  writingElements.datePanel.hidden = true;
  writingElements.dateButton.setAttribute('aria-expanded', 'false');
}
function openWriting(mode = 'writing') {
  writingMode = mode;
  const overlay = mode === 'overlay';
  document.body.classList.toggle('is-overlay', overlay);
  writingElements.view.setAttribute('aria-label', overlay ? 'Ü 중첩하기' : 'W 기록하기');
  document.querySelector('.writing-prompt').innerHTML = overlay
    ? '새로운 감상을 기록하세요' : '지금 당신의 머리 속에는<br>어떤 생각이 떠오르나요?';
  const draft = noteDrafts[mode];
  writingElements.input.value = draft ? draft.text : '';
  setWritingDate(draft ? draft.date : todayForWriting());
  if (overlay) renderOverlaySources();
  writingOpen = true;
  document.body.classList.add('is-writing');
  writingElements.view.hidden = false;
  hideWritingDate();
  writingElements.input.focus({preventScroll: true});
}
function closeWriting() {
  if (!writingOpen) return;
  noteDrafts[writingMode] = {text: writingElements.input.value, date: writingElements.date.value};
  const returnFace = writingMode === 'find' ? 4 : writingMode === 'overlay' ? 2 : 1;
  if (writingMode === 'find') cleanupFind();
  writingOpen = false;
  document.body.classList.remove('is-overlay');
  writingElements.input.blur();
  if (writingAnimation) writingAnimation.cancel();
  writingElements.view.hidden = true;
  document.body.classList.remove('is-writing');
  document.querySelector('.instruction').hidden = false;
  document.querySelector(`.face-button[data-face="${returnFace}"]`).focus({preventScroll: true});
}
async function saveWriting() {
  const input = writingElements.input;
  if (writingSaving || !input.value.trim() || (writingMode === 'find' && !findSelected)) return;
  writingSaving = true;
  writingNotes.push({ date: writingElements.date.value, text: input.value, savedAt: new Date().toISOString(), mode: writingMode, sources: writingMode === 'find' ? [findSelected.savedAt] : writingMode === 'overlay' ? overlaySources.map(note => note.savedAt) : [] });
  saveWritingNotes();
  // 저장된 종이만 넘기고 그 아래에 새 빈 종이를 둡니다.
  const copy = document.createElement('div');
  copy.className = 'writing-paper paper-copy';
  copy.setAttribute('aria-hidden', 'true');
  const body = document.createElement('div');
  body.className = 'saved-body'; body.textContent = input.value;
  copy.append(body); writingElements.stack.append(copy);
  input.value = ''; input.readOnly = true;
  setWritingDate(todayForWriting()); hideWritingDate();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  writingAnimation = animateFlexiblePaper(copy, reduced);
  try { await writingAnimation.finished; } catch (_) { /* Esc로 애니메이션을 취소한 경우 */ }
  copy.remove(); writingAnimation = null; writingSaving = false; input.readOnly = false;
  if (writingMode === 'find' && writingOpen) resetFindAfterSave();
  if (writingOpen) input.focus({preventScroll: true});
}

// 작은 면 조각을 연속 곡면으로 연결합니다. 오른쪽 아래가 먼저 들리고 위쪽은 뒤따릅니다.
function animateFlexiblePaper(copy, reduced) {
  if (reduced) return { finished: Promise.resolve(), cancel() {} };
  const bounds = copy.getBoundingClientRect();
  const width = bounds.width, height = bounds.height;
  // 가로로 연결된 띠를 사용해 격자 조각 사이의 균열을 없앱니다.
  const columns = 1, rows = 64;
  const dx = width / columns, dy = height / rows;
  const sheet = document.createElement('div');
  sheet.className = 'paper-curl'; sheet.setAttribute('aria-hidden', 'true');
  const tiles = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const tile = document.createElement('div'); tile.className = 'paper-curl-tile';
    tile.style.width = `${dx}px`; tile.style.height = `${dy + .5}px`;
    const front = document.createElement('div'); front.className = 'paper-curl-front';
    const content = copy.cloneNode(true);
    content.classList.add('paper-curl-content');
    Object.assign(content.style, {width: `${width}px`, height: `${height}px`, left: `${-col * dx}px`, top: `${-row * dy}px`, padding: getComputedStyle(copy).padding});
    const shade = document.createElement('div'); shade.className = 'paper-curl-shade';
    const back = document.createElement('div'); back.className = 'paper-curl-back';
    front.append(content, shade); tile.append(front, back); sheet.append(tile);
    tiles.push({tile, shade, back, row, col});
  }
  const castShadow = document.createElement('div');
  castShadow.className = 'paper-cast-shadow';
  castShadow.setAttribute('aria-hidden', 'true');
  copy.parentElement.append(castShadow, sheet); copy.style.visibility = 'hidden';
  const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  let frame, done = false, resolve;
  const finished = new Promise(r => { resolve = r; });
  function cleanup() {
    if (done) return;
    done = true; cancelAnimationFrame(frame); sheet.remove(); castShadow.remove(); resolve();
  }
  const start = performance.now();
  function render(now) {
    const progress = Math.min(1, (now - start) / 1000);
    // 아래쪽부터 휘어지는 곡률을 적분해 종이 길이를 유지합니다.
    const points = [];
    for (let col = 0; col <= columns; col++) {
      const line = [[col * dx, 0, 0]];
      for (let row = 0; row < rows; row++) {
        const v = (row + .5) / rows;
        // 먼저 끝부분이 들리고, 곡률이 안쪽으로 전달된 다음 상단 축을 넘어갑니다.
        // 폭 방향은 같은 곡률을 공유하므로 종이가 찢어진 듯한 틈이 생기지 않습니다.
        const hinge = Math.PI * .985 * smooth((progress - .15) / .85);
        const curl = 1.35 * Math.sin(Math.PI * progress) * Math.pow(v, 2.4);
        const angle = hinge + curl;
        const prev = line[row];
        line.push([col * dx, prev[1] + dy * Math.cos(angle), prev[2] + dy * Math.sin(angle)]);
      }
      points.push(line);
    }
    for (const {tile, shade, back, row, col} of tiles) {
      const a = points[col][row], b = points[col + 1][row], c = points[col][row + 1];
      const ex = b.map((n,i) => (n-a[i])/dx), ey = c.map((n,i) => (n-a[i])/dy);
      const normal = [ex[1]*ey[2]-ex[2]*ey[1],ex[2]*ey[0]-ex[0]*ey[2],ex[0]*ey[1]-ex[1]*ey[0]];
      tile.style.transform = `matrix3d(${[...ex,0,...ey,0,...normal,0,...a,1].join(',')})`;
      const shadow = .02 + .16 * (1 - Math.abs(normal[2]));
      shade.style.opacity = String(shadow);
      // 뒷면은 조각별 음영 없이 CSS의 단색 그레이를 유지합니다.
    }
    // 모서리가 약간 비틀려 들리는 느낌을 주되, 위로 넘기는 흐름은 유지합니다.
    const tip = Math.sin(Math.PI * progress) * (1 - smooth(progress / .65));
    sheet.style.transform = `rotateY(${-3 * tip}deg) rotateZ(${-1.2 * tip}deg)`;
    const lowest = Math.max(0, ...points[0].map(point => point[1]));
    const lift = Math.max(...points[0].map(point => point[2]));
    castShadow.style.height = `${Math.min(height, lowest + lift * .12)}px`;
    castShadow.style.opacity = String(.22 * Math.sin(Math.PI * progress));
    castShadow.style.filter = `blur(${4 + lift * .035}px)`;
    // 종이가 완전히 위로 넘어갈 때까지 뒷면을 유지합니다.
    sheet.style.opacity = String(1 - smooth((progress - .97) / .03));
    if (progress === 1) cleanup(); else frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  return {finished, cancel: cleanup};
}


// 전체 기록 중 두 개를 중복 없이 뽑습니다. 화면을 여는 동안에는 같은 두 기록을 유지합니다.
function pickOverlaySources(notes) {
  const pool = notes.slice();
  const selected = [];
  while (pool.length && selected.length < 2) {
    selected.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return selected;
}
function overlayDate(date) {
  const [y, m, d] = date.split('-');
  return `${y.slice(-2)}년 ${Number(m)}월 ${Number(d)}일의 기록`;
}
function renderOverlaySources() {
  overlaySources = pickOverlaySources(writingNotes);
  document.querySelectorAll('.source-note').forEach((card, index) => {
    const note = overlaySources[index];
    const date = card.querySelector('.source-date');
    const text = card.querySelector('.source-text');
    card.classList.toggle('is-empty', !note);
    date.textContent = note ? overlayDate(note.date) : '이전 기록';
    text.textContent = note ? note.text : index === 0
      ? 'W 기록하기에서 메모를 저장하면 이곳에 표시됩니다.'
      : '메모를 두 개 이상 저장하면 서로 다른 기록이 중첩됩니다.';
  });
}
