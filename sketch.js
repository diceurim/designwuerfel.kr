// 각 면은 독립된 2D 텍스처입니다. 나중에 아래 경로만 채우면 이미지로 교체됩니다.
// 예: ['assets/face-1.png', 'assets/face-2.png', ... "assets/face-6.png"]
const FACE_IMAGE_PATHS = [
  'assets/face-1.png',
  'assets/face-2.png',
  'assets/face-3.png',
  'assets/face-4.png',
  'assets/face-5.png',
  "assets/face-6.png",
];
const FACE_LAYOUT = [
  { value: 1, rx: (Math.PI / 2), ry: 0, normal: [0, -1, 0] },
  { value: 6, rx: -Math.PI / 2, ry: 0, normal: [0, 1, 0] },
  { value: 2, rx: 0, ry: 0, normal: [0, 0, 1] },
  { value: 5, rx: 0, ry: Math.PI, normal: [0, 0, -1] },
  { value: 3, rx: 0, ry: Math.PI / 2, normal: [1, 0, 0] },
  { value: 4, rx: 0, ry: -Math.PI / 2, normal: [-1, 0, 0] },
];
const DICE_SIZE = 112;
const FLOOR_Y = 150;
const THROW_DURATION = 2600;
let assetsReady = false;
let writingViewProgress = 0;
// 기록 화면에서 왼쪽 아래로 옮겨 그린 주사위가 시작화면 위치에서 얼마나 이동했는지(px).
let diceScreenShift = [0, 0];
let faceShader;
let textures = [];
let loadedFaces = [];
let diceRotation = [0, -Math.PI / 2, 0];
let positionX = 0;
let positionZ = 0;
let lift = 0;
let throwState = null;
let diceAudio = null;
let impactNoise = null;
let memoElement = null;
const MEMO_STORAGE_KEY = 'dice-w-memo-v1';
// 아이패드처럼 마우스 대신 손가락으로 조작하는 기기인지 확인합니다.
const IS_TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

async function setup() {
  // p5.js 2.x에서는 preload 대신 async setup에서 로딩을 기다립니다.
  const loads = await Promise.allSettled(FACE_IMAGE_PATHS.map(async path => {
    // 로딩이 일시적으로 실패하면 한 번 재시도합니다. 다른 그래픽으로 대체하지 않습니다.
    try { return await loadImage(path); }
    catch (_) { return await loadImage(path); }
  }));
  const failed = loads.map((item, i) => item.status === 'rejected' ? FACE_IMAGE_PATHS[i] : null).filter(Boolean);
  if (failed.length) {
    document.querySelector('.instruction').textContent = `이미지를 불러오지 못했어요: ${failed.join(', ')}`;
    console.error('주사위 이미지 로딩 실패:', failed);
    return;
  }
  loadedFaces = loads.map(item => item.value);
  const canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  // 한 면의 앞쪽은 원본 이미지, 뒤쪽은 같은 알파 형태의 흰색으로 렌더링합니다.
  faceShader = createShader(`
    precision highp float;
    attribute vec3 aPosition;
    attribute vec2 aTexCoord;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying vec2 vTexCoord;
    void main() {
      vTexCoord = aTexCoord;
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
    }
  `, `
    precision highp float;
    uniform sampler2D uFaceTexture;
    varying vec2 vTexCoord;
    void main() {
      vec4 pixel = texture2D(uFaceTexture, vTexCoord);
      // 투명 픽셀이 깊이 버퍼를 가리지 않도록 합니다.
      if (pixel.a < 0.01) discard;
      // p5의 Y축 방향에서 plane의 바깥쪽은 시계 방향입니다.
      vec3 faceColor = gl_FrontFacing ? vec3(1.0) : pixel.rgb;
      gl_FragColor = vec4(faceColor, pixel.a);
    }
  `);
  textures = loadedFaces.map(prepareImageTexture);
  assetsReady = true;
  setupFaceButtons();
  setupWriting();
  // 주사위를 클릭하거나 탭하면 스페이스바처럼 무작위로 굴립니다.
  // 기록 화면 안에서 누르면 그 화면을 닫고 시작화면으로 돌아가면서 바로 굴립니다.
  canvas.elt.addEventListener('click', event => {
    if (!isOverDice(event) || throwState) return;
    if (writingOpen) closeCurrentView();
    rollDice();
  });
  canvas.elt.addEventListener('pointermove', event => {
    canvas.elt.style.cursor = !throwState && isOverDice(event) ? 'pointer' : '';
  });
  if (IS_TOUCH) adaptCopyForTouch();
  cycleInlineFaces();
  describe('Würfel 시작화면. 중앙 주사위와 W, ü, r, f, e, l 이미지 버튼.');
}

function closeCurrentView() {
  if (writingMode === 'lolling') closeLolling();
  else if (writingMode === 'remember') closeRemember();
  else if (writingMode === 'experiment') closeExperiment();
  else closeWriting();
}

// 화면에 보이는 주사위 영역(손가락 여유 16px 포함) 안을 눌렀는지 확인합니다.
function isOverDice(event) {
  const canvasBox = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - canvasBox.left, y = event.clientY - canvasBox.top;
  const dice = getDiceScreenBounds(), pad = 16;
  return x >= dice.left - pad && x <= dice.right + pad && y >= dice.top - pad && y <= dice.bottom + pad;
}

// 키보드가 없는 기기에서는 스페이스바·Enter 안내를 탭 안내로 바꿉니다.
// 안내 문구 속 작은 면 아이콘이 W·ü·r·f·e·l 여섯 면을 차례로 보여줍니다.
function cycleInlineFaces() {
  let face = 1;
  setInterval(() => {
    face = face % 6 + 1;
    document.querySelectorAll('.inline-face img').forEach(img => { img.src = `assets/face-${face}.png`; });
  }, 1200);
}

function adaptCopyForTouch() {
  const icon = '<span class="inline-face" aria-hidden="true"><img src="assets/face-1.png" alt=""></span>';
  document.querySelector('.instruction .ko').innerHTML = `${icon} 버튼을 눌러 영감을 기록할 수는 있지만,<br>가능한 <u>주사위를 탭</u>해서 굴려보세요`;
  document.querySelector('.instruction .de').innerHTML = `Du kannst deine Inspirationen auch per Tipp auf den ${icon} Button festhalten.<br>Versuch aber, möglichst <u>auf den Würfel zu tippen</u>, um zu würfeln!`;
  document.querySelectorAll('.save-hint').forEach(hint => { hint.textContent = '탭해서 저장하기'; });
}

// PNG의 알파값을 유지해서 투명한 부분 너머로 장면이 보이도록 합니다.
// 비정사각형 이미지는 면을 채우도록 정사각형으로 늘어납니다.
function prepareImageTexture(img) {
  const g = createGraphics(512, 512);
  g.pixelDensity(1);
  g.clear();
  g.image(img, 0, 0, 512, 512);
  return g;
}

function rollDice(requestedFace = null) {
  if (!assetsReady || throwState || writingOpen) return;
  if (memoElement) {
    memoElement.hidden = true;
    memoElement.blur();
  }
  playRollingSound();
  // 면을 먼저 균등하게 추첨한 뒤, 해당 면이 위를 향하는 자세를 선택합니다.
  const resultFace = Number.isInteger(requestedFace) && requestedFace >= 1 && requestedFace <= 6
    ? requestedFace : Math.floor(random(6)) + 1;
  const target = landingRotation(resultFace);
  setActiveFace(requestedFace === null ? null : resultFace);
  const start = diceRotation.slice();
  // 여러 바퀴 회전한 뒤 마지막에는 면이 바닥과 평행하게 정렬됩니다.
  const end = target.map((angle, i) => angle + Math.round(start[i] / TWO_PI) * TWO_PI + Math.floor(random(3, 6)) * TWO_PI);
  document.querySelector('.instruction').hidden = true;
  throwState = { startTime: millis(), start, end, startX: positionX, startZ: positionZ, endX: 0, endZ: 0 };
}

function updateThrow() {
  if (!throwState) return;
  const t = constrain((millis() - throwState.startTime) / THROW_DURATION, 0, 1);
  const move = 1 - Math.pow(1 - t, 3);
  positionX = lerp(throwState.startX, throwState.endX, move) - 70 * Math.sin(Math.PI * t);
  positionZ = lerp(throwState.startZ, throwState.endZ, move);
  // 공중으로 던지기 → 점점 작은 바운스 → 정지.
  if (t < 0.45) lift = 230 * Math.sin(Math.PI * t / 0.45);
  else if (t < 0.7) lift = 85 * Math.sin(Math.PI * (t - 0.45) / 0.25);
  else if (t < 0.86) lift = 28 * Math.sin(Math.PI * (t - 0.7) / 0.16);
  else lift = 0;
  const turn = 1 - Math.pow(1 - t, 3);
  diceRotation = throwState.start.map((angle, i) => lerp(angle, throwState.end[i], turn));
  if (t === 1) {
    diceRotation = diceRotation.map(angle => ((angle % TWO_PI) + TWO_PI) % TWO_PI);
    lift = 0;
    throwState = null;
    setActiveFace(getTopFace());
    if (getTopFace() === 1) openWriting();
    else if (getTopFace() === 2) openWriting('overlay');
    else if (getTopFace() === 3) openRemember();
    else if (getTopFace() === 4) openFind();
    else if (getTopFace() === 5) openExperiment();
    else if (getTopFace() === 6) openLolling();
    else document.querySelector('.instruction').hidden = false;
  }
}

// p5의 rotateX → rotateY → rotateZ와 같은 행렬 순서.
function rotateVector([x, y, z], rotation = diceRotation) {
  const [rx, ry, rz] = rotation;
  const x1 = x * Math.cos(rz) - y * Math.sin(rz);
  const y1 = x * Math.sin(rz) + y * Math.cos(rz);
  const x2 = x1 * Math.cos(ry) + z * Math.sin(ry);
  const z2 = -x1 * Math.sin(ry) + z * Math.cos(ry);
  return [x2, y1 * Math.cos(rx) - z2 * Math.sin(rx), y1 * Math.sin(rx) + z2 * Math.cos(rx)];
}

function supportHeight() {
  // 회전 중 바닥을 뚫지 않도록 여덟 꼭짓점으로 접지 높이를 계산합니다.
  let lowest = 0;
  const h = DICE_SIZE / 2;
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) lowest = Math.max(lowest, rotateVector([x, y, z])[1]);
  return lowest;
}

function draw() {
  if (!assetsReady) return;
  updateThrow();
  const sceneColor = '#121212';
  background(sceneColor);
  positionMemo();
  const viewScale = Math.min(width / 520, height / 760, 1.25);
  // 카메라 시선을 정지한 주사위 중심에 맞춰 모든 화면 크기에서 중앙에 배치합니다.
  const centerY = FLOOR_Y - DICE_SIZE / 2;
  camera(380, centerY - 510, 760, 0, centerY, 0, 0, 1, 0);
  // 투영 범위를 이동해 창 크기에 관계없이 화면에서 정확히 5px 아래로 배치합니다.
  // 화면 전환 시 주사위를 왼쪽 아래로 부드럽게 이동합니다.
  const destination = writingOpen && writingMode !== 'find' ? 1 : 0;
  writingViewProgress = lerp(writingViewProgress, destination, 1 - Math.exp(-Math.min(deltaTime, 100) / 170));
  if (Math.abs(writingViewProgress - destination) < .001) writingViewProgress = destination;
  const halfSize = DICE_SIZE * viewScale * .78;
  const targetX = lollingWorld ? lollingWorld.dice.position.x : Math.max(width * .082, halfSize + 20) + 30; //오른쪽으로 30위
  const targetY = lollingWorld ? lollingWorld.dice.position.y : height - Math.max(height * .13, halfSize + 16) - 30; // 위로 30위
  const offsetX = (targetX - width / 2) * writingViewProgress / viewScale;
  const screenOffset = (5 - (targetY - height / 2 + 5) * writingViewProgress) / viewScale;
  diceScreenShift = [(targetX - width / 2) * writingViewProgress, (targetY - height / 2 - 5) * writingViewProgress];
  ortho(-width / (2 * viewScale) - offsetX, width / (2 * viewScale) - offsetX,
    -height / (2 * viewScale) - screenOffset,
    height / (2 * viewScale) - screenOffset, 0.1, 3000);
  noStroke();
  // 바닥과 부드러운 접지 그림자.
  push();
  translate(0, FLOOR_Y + 1, 0);
  rotateX(HALF_PI);
  fill(sceneColor);
  plane(5000, 5000);
  pop();
  for (let i = writingOpen ? 0 : 10; i > 0; i--) {
    push();
    // Y축은 아래 방향: 밑면(150) < 그림자(150.32~150.5) < 바닥(151).
    // 그림자가 밑면 앞에서 깊이 버퍼를 차지하지 않도록 바닥 쪽에 배치합니다.
    translate(positionX, FLOOR_Y + 0.5 - (10 - i) * 0.02, positionZ);
    rotateX(HALF_PI);
    fill(0, 0, 0, (1 - lift / 350) * 12);
    ellipse(0, 0, DICE_SIZE * (1.2 + i * 0.08 + lift / 220), DICE_SIZE * (1.2 + i * 0.08 + lift / 220));
    pop();
  }
  push();
  translate(positionX, FLOOR_Y - supportHeight() - lift, positionZ);
  rotateX(diceRotation[0]);
  rotateY(diceRotation[1]);
  rotateZ(diceRotation[2]);
  for (const face of FACE_LAYOUT) {
    push();
    rotateY(face.ry);
    rotateX(face.rx);
    translate(0, 0, DICE_SIZE / 2);
    shader(faceShader);
    faceShader.setUniform('uFaceTexture', textures[face.value - 1]);
    plane(DICE_SIZE, DICE_SIZE);
    resetShader();
    pop();
  }
  pop();
}

function keyPressed(event) {
  if (writingOpen) return;
  if (event.code === 'Space' && !event.target.isContentEditable && !['INPUT', 'SUMMARY', 'TEXTAREA'].includes(event.target.tagName)) {
    event.preventDefault();
    if (!event.repeat) rollDice();
    return false;
  }
}
function windowResized() { resizeCanvas(windowWidth, windowHeight);  }

// Web Audio로 가벼운 주사위 충돌음을 합성합니다. 외부 음원 파일은 필요 없습니다.
function playRollingSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    ensureDiceAudio();
    // 클릭/스페이스바 이벤트에서 오디오를 시작해 자동 재생 제한에 대응합니다.
    diceAudio.resume().then(() => {
      // 탭이 비활성화되어 이미 롤링이 끝났다면 늦게 소리를 시작하지 않습니다.
      if (!throwState || document.hidden) return;
      const elapsed = (millis() - throwState.startTime) / 1000;
      const baseTime = diceAudio.currentTime - elapsed;
      const duration = THROW_DURATION / 1000;
      const hits = [[0.015, 0.18], [duration * 0.45, 0.42],
                    [duration * 0.7, 0.29], [duration * 0.86, 0.18]];
      // 마지막 착지 구간에서 작은 충돌음 간격을 벌리고 음량을 줄입니다.
      for (let t = duration * 0.87; t < duration - 0.09; t += 0.055 + 0.09 * (t / duration)) {
        hits.push([t, 0.13 * (1 - t / duration) / 0.13]);
      }
      for (const [offset, strength] of hits) {
        if (offset >= elapsed) playDiceImpact(baseTime + offset, strength);
      }
    }).catch(error => console.warn('주사위 소리를 시작하지 못했습니다.', error));
  } catch (error) {
    console.warn('주사위 소리 초기화 실패:', error);
  }
}

function playDiceImpact(time, strength) {
  const source = diceAudio.createBufferSource();
  source.buffer = impactNoise;
  source.playbackRate.value = 0.85 + Math.random() * 0.35;
  const filter = diceAudio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1500 + Math.random() * 1000;
  filter.Q.value = 0.65;
  const noiseGain = diceAudio.createGain();
  noiseGain.gain.setValueAtTime(strength, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.065);
  source.connect(filter).connect(noiseGain).connect(diceAudio.destination);
  source.start(time);
  source.stop(time + 0.08);
  source.onended = () => { source.disconnect(); filter.disconnect(); noiseGain.disconnect(); };

  const knock = diceAudio.createOscillator();
  knock.type = 'triangle';
  knock.frequency.setValueAtTime(230 + Math.random() * 80, time);
  knock.frequency.exponentialRampToValueAtTime(95, time + 0.055);
  const toneGain = diceAudio.createGain();
  toneGain.gain.setValueAtTime(strength * 0.6, time);
  toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.065);
  knock.connect(toneGain).connect(diceAudio.destination);
  knock.start(time);
  knock.stop(time + 0.08);
  knock.onended = () => { knock.disconnect(); toneGain.disconnect(); };
}

function getTopFace() {
  return FACE_LAYOUT.reduce((best, face) =>
    rotateVector(face.normal)[1] < rotateVector(best.normal)[1] ? face : best
  ).value;
}

function setupMemo() {
  memoElement = document.getElementById('wMemo');
  try { memoElement.value = localStorage.getItem(MEMO_STORAGE_KEY) || ''; } catch (_) {}
  memoElement.addEventListener('input', () => {
    try { localStorage.setItem(MEMO_STORAGE_KEY, memoElement.value); } catch (_) {}
  });
}

function showMemo() {
  // 최초 화면에서는 숨겨두고, 실제로 던져서 W가 윗면에 나왔을 때 표시합니다.
  const wasHidden = memoElement.hidden;
  memoElement.hidden = false;
  positionMemo();
  if (wasHidden) memoElement.focus({ preventScroll: true });
  // 다시 던지면 숨기고, W로 착지했을 때 이전 내용을 다시 보여줍니다.
}

function positionMemo() {
  if (!memoElement || memoElement.hidden) return;
  const scale = Math.min(width / 520, height / 760, 1.25);
  // 현재 카메라에서 큐브의 가로 투영 크기. 정지한 주사위 왼쪽에 배치합니다.
  const diceWidth = DICE_SIZE * scale * (760 + 380) / Math.hypot(760, 380);
  const gap = 16;
  const memoOffsetX = -150; // 음수: 왼쪽, 양수: 오른쪽 (px)
  const available = width / 2 - diceWidth / 2 - gap - 12;
  const noteSize = Math.max(60, Math.min(diceWidth * 1.3, available));
  memoElement.style.width = `${noteSize}px`;
  memoElement.style.height = `${noteSize}px`;
  memoElement.style.left = `${Math.max(8, width / 2 - diceWidth / 2 - gap - noteSize + memoOffsetX)}px`;
  memoElement.style.top = `${height / 2 + 5 - noteSize / 2}px`;
  memoElement.style.padding = noteSize < 120 ? '8px' : '16px';
}

function ensureDiceAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
    if (!diceAudio) {
      diceAudio = new AudioContextClass();
      impactNoise = diceAudio.createBuffer(1, Math.ceil(diceAudio.sampleRate * 0.09), diceAudio.sampleRate);
      const samples = impactNoise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
  diceAudio.resume().catch(() => {});
}

function getDiceScreenBounds() {
  const scale = Math.min(width / 520, height / 760, 1.25);
  const horizontal = Math.hypot(380, 760);
  const distance = Math.hypot(horizontal, 510);
  const centerY = FLOOR_Y - DICE_SIZE / 2;
  const points = [];
  const half = DICE_SIZE / 2;
  for (const x of [-half, half]) for (const y of [-half, half]) for (const z of [-half, half]) {
    const v = rotateVector([x, y, z]);
    const px = v[0] + positionX;
    const py = v[1] + FLOOR_Y - supportHeight() - lift - centerY;
    const pz = v[2] + positionZ;
    points.push([
      width / 2 + diceScreenShift[0] + scale * (px * 760 - pz * 380) / horizontal,
      height / 2 + 5 + diceScreenShift[1] + scale * (px * 380 * 510 / (horizontal * distance) + py * horizontal / distance + pz * 760 * 510 / (horizontal * distance))
    ]);
  }
  return { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])),
    top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
}

// 90도 단위 자세 중 요청한 면이 실제로 위(-Y)를 향하는 자세만 선택합니다.
function landingRotation(value) {
  const normal = FACE_LAYOUT.find(face => face.value === value).normal;
  const candidates = [];
  const quarter = Math.PI / 2;
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
    const rotation = [x * quarter, y * quarter, z * quarter];
    if (rotateVector(normal, rotation)[1] < -0.999) candidates.push(rotation);
  }
  return candidates[Math.floor(random(candidates.length))];
}

function setActiveFace(value) {
  document.querySelectorAll('.face-button').forEach(button => {
    const selected = Number(button.dataset.face) === value;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setupFaceButtons() {
  setActiveFace(null);
  document.querySelectorAll('.face-button').forEach(button => {
    button.addEventListener('click', () => rollDice(Number(button.dataset.face)));
  });
}
