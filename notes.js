// 직접 만든 메모는 W 메모와 별개로 관리하고, 다시 굴려도 그대로 남깁니다.
const NOTES_STORAGE_KEY = 'dice-manual-notes-v1';
let manualNotes = [];
let canvasClickTimer = null;
let manualNoteCounter = 0;
let noteLayer = 1;

function setupManualNotes(canvasElement) {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) manualNotes = saved.filter(note => note && typeof note.text === 'string' && Number.isFinite(note.x) && Number.isFinite(note.y)).map(note => ({...note, element: null}));
  } catch (_) {}
  manualNotes.forEach(renderManualNote);
  layoutManualNotes();
  document.getElementById('addNote').addEventListener('click', () => {
    const die = getDiceScreenBounds();
    const stagger = (manualNoteCounter++ % 5) * 18;
    const size = manualNoteSize();
    if (die.left - 12 >= size + 20) {
      createManualNote(die.left - size / 2 - 20 - stagger, height / 2 + 5 + stagger);
    } else {
      // 작은 화면에서는 새 메모가 주사위를 가리지 않도록 위쪽 여백에 배치합니다.
      createManualNote(width / 2 + stagger, die.top - size / 2 - 20 - stagger);
    }
  });
  canvasElement.addEventListener('pointerdown', event => {
    if (event.button === 0) {
      try { ensureDiceAudio(); } catch (_) {}
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  });
  // 한 번 클릭을 잠시 기다려, 메모 생성 더블클릭에서는 주사위를 던지지 않습니다.
  canvasElement.addEventListener('click', event => {
    if (event.button !== 0) return;
    clearTimeout(canvasClickTimer);
    if (event.detail > 1) return;
    canvasClickTimer = setTimeout(() => { canvasClickTimer = null; rollDice(); }, 400);
  });
  canvasElement.addEventListener('dblclick', event => {
    event.preventDefault();
    clearTimeout(canvasClickTimer);
    canvasClickTimer = null;
    const bounds = canvasElement.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (isPointOverDice(x, y)) { rollDice(); return; }
    createManualNote(x, y);
  });
}

function isPointOverDice(x, y) {
  const box = getDiceScreenBounds();
  const padding = 8;
  return x >= box.left - padding && x <= box.right + padding && y >= box.top - padding && y <= box.bottom + padding;
}

function createManualNote(x, y) {
  const note = { text: '', x: x / width, y: y / height, element: null };
  manualNotes.push(note);
  renderManualNote(note);
  layoutManualNotes();
  saveManualNotes();
  note.element.querySelector('textarea').focus({preventScroll: true});
}

function renderManualNote(note) {
  const card = document.createElement('section');
  card.className = 'note-card';
  const input = document.createElement('textarea');
  input.setAttribute('aria-label', '추가 메모');
  input.placeholder = '메모를 입력하세요…';
  input.spellcheck = false;
  input.value = note.text;
  input.addEventListener('input', () => { note.text = input.value; saveManualNotes(); });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'note-close';
  close.textContent = '×';
  close.setAttribute('aria-label', '이 메모 삭제');
  close.addEventListener('click', () => {
    manualNotes = manualNotes.filter(item => item !== note);
    card.remove();
    saveManualNotes();
  });
  const handle = document.createElement('div');
  handle.className = 'note-handle';
  handle.textContent = '⋯';
  handle.title = '클릭한 채 드래그해서 이동';
  handle.setAttribute('role', 'button');
  handle.setAttribute('aria-label', '메모 이동');
  handle.tabIndex = 0;
  card.append(input, handle, close);
  setupNoteDragging(note, card, handle);
  document.getElementById('noteBoard').append(card);
  note.element = card;
}

function manualNoteSize() {
  const scale = Math.min(width / 520, height / 760, 1.25);
  return Math.max(60, Math.min(220, Math.max(160, DICE_SIZE * scale * 1.3), width - 24, height - 120));
}

function layoutManualNotes() {
  const size = manualNoteSize();
  for (const note of manualNotes) {
    if (!note.element) continue;
    note.element.style.width = `${size}px`;
    note.element.style.height = `${size}px`;
    note.element.style.left = `${Math.max(12, Math.min(width - size - 12, note.x * width - size / 2))}px`;
    note.element.style.top = `${Math.max(8, Math.min(height - size - 8, note.y * height - size / 2))}px`;
  }
}

function saveManualNotes() {
  try { localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(manualNotes.map(({text, x, y}) => ({text, x, y})))); } catch (_) {}
}

function moveManualNote(note, left, top) {
  const box = note.element.getBoundingClientRect();
  const x = Math.max(8, Math.min(width - box.width - 8, left));
  const y = Math.max(8, Math.min(height - box.height - 8, top));
  note.element.style.left = `${x}px`;
  note.element.style.top = `${y}px`;
  note.x = (x + box.width / 2) / width;
  note.y = (y + box.height / 2) / height;
}

function setupNoteDragging(note, card, handle) {
  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const box = card.getBoundingClientRect();
    drag = { pointerId: event.pointerId, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top };
    card.style.zIndex = `${++noteLayer}`;
    card.classList.add('dragging');
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    moveManualNote(note, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });
  const finish = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    card.classList.remove('dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    saveManualNotes();
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('keydown', event => {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key]) return;
    event.preventDefault();
    const box = card.getBoundingClientRect();
    const step = event.shiftKey ? 20 : 5;
    const [dx, dy] = directions[event.key];
    moveManualNote(note, box.left + dx * step, box.top + dy * step);
    saveManualNotes();
  });
}
