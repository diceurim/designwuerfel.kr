// 주사위 면의 방향(그리기는 dice3d.js의 3D 모델이 맡고, 여기 값은 결과 면과 자세 계산에 씁니다).
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
// Shop 구매 패널이 넓게 열리면 주사위 공간이 왼쪽으로 좁아집니다. 바닥과 주사위를 함께 옮기는 화면 x 이동량(px)과 그 목표값입니다.
let shopRoomShift = 0;
let shopRoomGoal = 0;
// 시작 화면과 Shop 화면 위쪽 띠의 높이(px, 휴대폰은 띠가 없어 0). 주사위 공간은 이 띠 아래만 씁니다.
let topBandHeight = 0;
let topBandProgress = 1;   // 기록 화면에서는 띠가 없어지므로 0으로 옮겨 갑니다.
let sceneDrawn = false;    // p5가 위치를 한 번 계산한 뒤부터 3D 주사위를 그립니다.
// 지금 주사위를 그리는 배율. 휴대폰에서 화면이 열리면 작아집니다(dice3d.js도 같은 값을 씁니다).
// 화면 크기에 맞춘 주사위 배율. 3D 주사위가 p5의 첫 프레임보다 먼저 그려질 수 있어 처음부터 실제 값으로 시작합니다.
const viewScaleFor = (w, h) => Math.min(w / 520, h / 760, 1.25);
let diceViewScale = viewScaleFor(innerWidth, innerHeight) || 1;
// 휴대폰(폭 600px 이하)에서는 화면이 열리면 주사위를 이 비율로 줄여 왼쪽 아래 구석에 둡니다.
const PHONE_DOCK_SCALE = .55;
// Shop 화면: 흰 배경에 툰 셰이딩 없는 실물 주사위만 놓입니다. shopProgress는 배경이 바뀌는 정도(0 → 1)입니다.
let shopMode = false;
let shopProgress = 0;
// Shop 화면에서 주사위가 안쪽(뒤)으로 갈수록 작아지는 비율. 그림자 크기도 함께 맞춥니다(dice3d.js가 정합니다).
let diceDepthScale = 1;
// Shop 주사위의 밝기 단계(0: 윗면 1 → 1: 윗면 6). 밝을수록 방이 어두워지고 바닥에 따뜻한 빛이 번집니다(dice3d.js가 정합니다).
let diceGlowLevel = 0;
// 화면에 보이는 주사위 중심(CSS px, 왼쪽 위 기준). dice3d.js가 매 프레임 넣어 줍니다. 없으면 화면 가운데.
let diceScreenCenter = null;
// 빛이 닿는 반지름(화면 짧은 변 기준 비율): 윗면 1 → 6
const POOL_RADIUS_MIN = 0.22, POOL_RADIUS_MAX = 0.95;
// 빛 웅덩이 가운데 밝기(어두운 배경색 0 → 밝은 색 1): 윗면 1일 때 값. 6에서는 1
const POOL_PEAK_MIN = 0.35;
// 윗면 1은 조명이 꺼진 상태(turn off). 단계 0(윗면 1) → 1, 단계 0.2(윗면 2) 이상 → 0으로 부드럽게 바뀝니다.
const lightOff = level => 1 - Math.min(1, Math.max(0, level / 0.2)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, level / 0.2)));
let lastHintInk = '';
let lastBandLook = '';
let shopPanelBack = 0;   // 구매 패널 글자 뒤로 비쳐 보이는 밝기(0~1). 반투명 패널이라 방의 밝기가 그대로 투과됩니다.
// Shop 방의 색감(고정)과 주사위 둘레 바닥 빛의 색감(고정). 밝기 단계에 따라 명도만 바뀝니다.
const SHOP_ROOM_HUE = 222, SHOP_ROOM_SAT = 8;
const SHOP_GLOW_HUE = 34, SHOP_GLOW_SAT = 45;
// Shop 바닥(=배경) 셰이더: 방은 기본 배경색(어두운 푸른 회색)이고, 주사위 둘레에만 빛이 퍼집니다.
// 빛의 중심은 화면에 보이는 주사위 중심을 따라가고, 윗면 숫자가 클수록 빛이 닿는 범위가 넓어집니다.
// 주사위 바로 둘레 바닥에는 늘 같은 따뜻한 빛이 밝기 단계만큼 번집니다(바닥 위 거리로 계산해 원근감이 그대로 따라옵니다).
let floorShader;
const FLOOR_SIZE = 5000;
const FLOOR_VERT = `
  precision highp float;
  attribute vec3 aPosition;
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  varying vec2 vFloor;
  void main() {
    vFloor = aPosition.xy;
    gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
  }`;
const FLOOR_FRAG = `
  precision highp float;
  varying vec2 vFloor;
  uniform vec2 uResolution, uPoolCenter;
  uniform float uLevel, uShop, uFloorSize, uSpillRadius, uPoolRadius, uOff;
  uniform vec2 uDice;
  uniform vec3 uMemo, uDark, uLight, uWarm;
  void main() {
    // 주사위 둘레의 빛 웅덩이: 화면에 보이는 주사위 중심에서 퍼지고, 반지름 밖으로 갈수록 부드럽게 흐려져 기본 배경색으로 이어집니다.
    float dist = length(gl_FragCoord.xy - uPoolCenter) / uPoolRadius;
    float pool = 1.0 - smoothstep(0.15, 1.0, dist);
    // 빛의 세기도 단계에 따라 오릅니다: 윗면 1은 가운데가 은은하게(POOL_PEAK_MIN), 6은 가장 밝게.
    float peak = mix(${POOL_PEAK_MIN.toFixed(3)}, 1.0, uLevel);
    // 윗면 1(uOff = 1)은 조명이 꺼진 상태: 빛 웅덩이·따뜻한 빛 없이 흰 방입니다.
    vec3 room = mix(uDark, uLight, pool * pool * (3.0 - 2.0 * pool) * peak * (1.0 - uOff));
    // 주사위 바로 둘레의 따뜻한 빛(바닥 위 거리로 계산해 원근감을 따름)
    float near = length(vFloor * uFloorSize - uDice) / uSpillRadius;
    room = mix(room, uWarm, exp(-near * near) * (0.15 + 0.45 * uLevel) * (1.0 - uOff));
    room = mix(room, uLight, uOff);
    gl_FragColor = vec4(mix(uMemo, room, uShop), 1.0);
  }`;
const colorVec = c => [red(c) / 255, green(c) / 255, blue(c) / 255];
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
  const canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  floorShader = createShader(FLOOR_VERT, FLOOR_FRAG);
  assetsReady = true;
  setupFaceButtons();
  setupModeButtons();
  setupWriting();
  // 주사위를 클릭하거나 탭하면 스페이스바처럼 무작위로 굴립니다.
  // 기록 화면 안에서 누르면 그 화면을 닫고 시작화면으로 돌아가면서 바로 굴립니다.
  canvas.elt.addEventListener('click', event => {
    // Shop 화면의 주사위는 클릭으로 던지지 않고, 들어 올렸다 놓아야 던져집니다(dice3d.js).
    if (shopMode || !isOverDice(event) || throwState) return;
    if (writingOpen) closeCurrentView();
    rollDice();
  });
  canvas.elt.addEventListener('pointermove', event => {
    canvas.elt.style.cursor = !shopMode && !throwState && isOverDice(event) ? 'pointer' : '';
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
  // Shop 화면에서는 들어 올린 그 칸에 다시 떨어집니다.
  throwState = { startTime: millis(), start, end, startX: positionX, startZ: positionZ, endX: shopMode ? positionX : 0, endZ: shopMode ? positionZ : 0, shop: shopMode };
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
    const thrownInShop = throwState.shop;
    throwState = null;
    // Shop 화면에서 굴린 주사위는 굴리는 경험만 주고, 기록 화면은 열지 않습니다.
    if (thrownInShop) return;
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
  shopProgress = lerp(shopProgress, shopMode ? 1 : 0, 1 - Math.exp(-Math.min(deltaTime, 100) / 120));
  if (Math.abs(shopProgress - (shopMode ? 1 : 0)) < .001) shopProgress = shopMode ? 1 : 0;
  // Shop 화면의 방: 기본 배경색은 푸른 기가 살짝 도는 어두운 회색(8%)이고, 빛 웅덩이 가운데는 밝은 색(97%)입니다.
  // 화면 안쪽의 실제 색은 아래 바닥 셰이더가 정하고, 여기 배경색은 바닥이 닿지 않는 곳과 같은 기본 배경색입니다.
  const roomDark = color(`hsl(${SHOP_ROOM_HUE}, ${SHOP_ROOM_SAT}%, 8%)`);
  const roomLight = color(`hsl(${SHOP_ROOM_HUE}, ${SHOP_ROOM_SAT}%, 97%)`);
  const off = lightOff(diceGlowLevel);
  const sceneColor = lerpColor(color('#121212'), lerpColor(roomDark, roomLight, off), shopProgress);
  background(sceneColor);
  // Shop 위쪽 띠: 윗면 1은 흰 띠에 검정 로고, 그 밖의 숫자는 방의 배경색에 #FAFAFA 로고. 방과 같은 속도로 바뀝니다.
  if (shopMode) {
    document.body.classList.toggle('top-band-light', off > 0.5);
    const band = lerpColor(roomDark, color(255), off);
    const bandLook = `rgb(${Math.round(red(band))}, ${Math.round(green(band))}, ${Math.round(blue(band))})|${(0.98 * (1 - off)).toFixed(3)}`;
    if (bandLook !== lastBandLook) {
      lastBandLook = bandLook;
      const [bandBg, bandInk] = bandLook.split('|');
      document.body.style.setProperty('--top-band-bg', bandBg);
      document.body.style.setProperty('--top-band-ink', bandInk);
    }
  }
  // 빛 웅덩이: 중심은 주사위를 따라가고, 반지름은 밝기 단계(윗면 숫자)에 따라 넓어집니다(화면 밖에서는 단계가 멈춰 있음).
  const poolCenter = diceScreenCenter || [width / 2, height / 2];
  const poolRadius = Math.min(width, height) * lerp(POOL_RADIUS_MIN, POOL_RADIUS_MAX, diceGlowLevel);
  // Shop 안내 글자색: 안내 문구 자리의 실제 배경 밝기(바닥 셰이더와 같은 계산)를 보고, 늘 읽히는 색을 고릅니다.
  const hint = document.querySelector('.shop-hint');
  const hintBox = hint && shopMode ? hint.getBoundingClientRect() : null;   // position: fixed라 offsetParent로는 표시 여부를 알 수 없습니다.
  const roomLightnessAt = (x, y) => {
    const t = Math.min(1, Math.max(0, (Math.hypot(x - poolCenter[0], y - poolCenter[1]) / poolRadius - 0.15) / 0.85));
    const pool = 1 - t * t * (3 - 2 * t);
    const lit = pool * pool * (3 - 2 * pool) * lerp(POOL_PEAK_MIN, 1, diceGlowLevel);
    return lerp(0.08, 0.97, lerp(lit, 1, off));
  };
  const hintY = hintBox ? hintBox.top + hintBox.height / 2 : 0;
  const hintBg = hintBox ? [hintBox.left, hintBox.left + hintBox.width / 2, hintBox.right].reduce((sum, x) => sum + roomLightnessAt(x, hintY), 0) / 3 : 1;
  const hintInk = hintBg >= 0.9 ? '#6f7178' : hintBg >= 0.5 ? '#2c2d31' : hintBg >= 0.25 ? '#f2f3f6' : '#b4b6bc';
  if (hintInk !== lastHintInk) { lastHintInk = hintInk; document.body.style.setProperty('--shop-hint-ink', hintInk); }
  if (shopMode) {
    const info = document.querySelector('.shop-panel-info').getBoundingClientRect();
    let sum = 0;
    for (const u of [0, .5, 1]) for (const v of [0, .5, 1]) sum += roomLightnessAt(info.left + info.width * u, info.top + info.height * v);
    shopPanelBack = 0.12 + 0.88 * sum / 9;   // 흰색 12% 유리(ui-style.css의 .shop-panel 배경)를 통과한 밝기
  }
  positionMemo();
  // 카메라 시선을 정지한 주사위 중심에 맞춰 모든 화면 크기에서 중앙에 배치합니다.
  const centerY = FLOOR_Y - DICE_SIZE / 2;
  camera(380, centerY - 510, 760, 0, centerY, 0, 0, 1, 0);
  // 투영 범위를 이동해 창 크기에 관계없이 화면에서 정확히 5px 아래로 배치합니다.
  // 화면 전환 시 주사위를 왼쪽 아래로 부드럽게 이동합니다.
  // 휴대폰에서는 F 발견하기에서도 주사위가 카드를 가리지 않도록 구석으로 옮깁니다. L 유희하기는 물리 주사위 위치를 따릅니다.
  const docked = width <= 600 && !lollingWorld;
  const destination = writingOpen && (writingMode !== 'find' || docked) ? 1 : 0;
  writingViewProgress = lerp(writingViewProgress, destination, 1 - Math.exp(-Math.min(deltaTime, 100) / 170));
  if (Math.abs(writingViewProgress - destination) < .001) writingViewProgress = destination;
  const viewScale = viewScaleFor(width, height) * (docked ? lerp(1, PHONE_DOCK_SCALE, writingViewProgress) : 1);
  diceViewScale = viewScale;
  const halfSize = DICE_SIZE * viewScale * .78;
  const targetX = lollingWorld ? lollingWorld.dice.position.x : docked ? halfSize + 16 : Math.max(width * .082, halfSize + 20) + 30; //오른쪽으로 30위
  const targetY = lollingWorld ? lollingWorld.dice.position.y : docked ? height - halfSize - 16 : height - Math.max(height * .13, halfSize + 16) - 30; // 위로 30위
  shopRoomShift = lerp(shopRoomShift, shopRoomGoal, 1 - Math.exp(-Math.min(deltaTime, 100) / 150));
  if (Math.abs(shopRoomShift - shopRoomGoal) < .5) shopRoomShift = shopRoomGoal;
  const offsetX = ((targetX - width / 2) * writingViewProgress + shopRoomShift) / viewScale;
  if (!writingOpen) topBandHeight = document.querySelector('.top-band').offsetHeight;
  topBandProgress = lerp(topBandProgress, writingOpen ? 0 : 1, 1 - Math.exp(-Math.min(deltaTime, 100) / 170));
  if (Math.abs(topBandProgress - (writingOpen ? 0 : 1)) < .001) topBandProgress = writingOpen ? 0 : 1;
  const roomDown = topBandHeight / 2 * topBandProgress;   // 띠 아래 공간의 가운데로 바닥과 주사위를 내립니다.
  const screenOffset = (5 - (targetY - height / 2 + 5) * writingViewProgress - roomDown) / viewScale;
  diceScreenShift = [(targetX - width / 2) * writingViewProgress + shopRoomShift, (targetY - height / 2 - 5) * writingViewProgress + roomDown];
  sceneDrawn = true;
  ortho(-width / (2 * viewScale) - offsetX, width / (2 * viewScale) - offsetX,
    -height / (2 * viewScale) - screenOffset,
    height / (2 * viewScale) - screenOffset, 0.1, 3000);
  noStroke();
  // 바닥과 부드러운 접지 그림자.
  push();
  translate(0, FLOOR_Y + 1, 0);
  rotateX(HALF_PI);
  if (shopProgress > 0) {
    shader(floorShader);
    floorShader.setUniform('uResolution', [width * pixelDensity(), height * pixelDensity()]);
    // gl_FragCoord는 장치 픽셀·아래쪽 기준이므로 맞춰 바꿉니다.
    floorShader.setUniform('uPoolCenter', [poolCenter[0] * pixelDensity(), (height - poolCenter[1]) * pixelDensity()]);
    floorShader.setUniform('uPoolRadius', poolRadius * pixelDensity());
    floorShader.setUniform('uLevel', diceGlowLevel);
    floorShader.setUniform('uOff', off);
    floorShader.setUniform('uShop', shopProgress);
    floorShader.setUniform('uFloorSize', FLOOR_SIZE);
    floorShader.setUniform('uDice', [positionX, positionZ]);
    floorShader.setUniform('uSpillRadius', DICE_SIZE * 1.6 * diceDepthScale);
    floorShader.setUniform('uMemo', colorVec(color('#121212')));
    floorShader.setUniform('uDark', colorVec(roomDark));
    floorShader.setUniform('uLight', colorVec(roomLight));
    floorShader.setUniform('uWarm', colorVec(color(`hsl(${SHOP_GLOW_HUE}, ${SHOP_GLOW_SAT + 20}%, 72%)`)));
    plane(FLOOR_SIZE, FLOOR_SIZE);
    resetShader();
  } else {
    fill(sceneColor);
    plane(FLOOR_SIZE, FLOOR_SIZE);
  }
  pop();
  for (let i = writingOpen || shopProgress === 1 || !window.glbDiceReady ? 0 : 10; i > 0; i--) {
    push();
    // Y축은 아래 방향: 밑면(150) < 그림자(150.32~150.5) < 바닥(151).
    // 그림자가 밑면 앞에서 깊이 버퍼를 차지하지 않도록 바닥 쪽에 배치합니다.
    translate(positionX, FLOOR_Y + 0.5 - (10 - i) * 0.02, positionZ);
    rotateX(HALF_PI);
    // Shop 화면에서는 아래의 또렷한 그림자로 바뀌므로, 이 번진 그림자는 사라집니다.
    fill(0, 0, 0, (1 - lift / 350) * 12 * (1 - shopProgress));
    ellipse(0, 0, DICE_SIZE * (1.2 + i * 0.08 + lift / 220), DICE_SIZE * (1.2 + i * 0.08 + lift / 220));
    pop();
  }
  // Shop 화면의 그림자: 위와 같은 자리·모양이지만 번지지 않고 가장자리가 또렷한 한 겹입니다.
  // 번진 그림자 겹(150.32~150.5)보다 살짝 위(150.25)에 두어 깊이 비교에서 가려지지 않게 합니다.
  if (shopProgress > 0 && !writingOpen && window.glbDiceReady) {
    push();
    translate(positionX, FLOOR_Y + 0.25, positionZ);
    rotateX(HALF_PI);
    fill(0, 0, 0, (1 - lift / 350) * 38 * shopProgress);
    const size = DICE_SIZE * diceDepthScale * (1.5 + lift / 220);
    ellipse(0, 0, size, size, 72);
    pop();
  }
  // 주사위 자체는 dice3d.js가 그리고, 여기서는 바닥과 그림자만 그립니다.
}

function keyPressed(event) {
  if (writingOpen || shopMode) return;
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
  memoElement.style.top = `${height / 2 + 5 + topBandHeight / 2 - noteSize / 2}px`;
  memoElement.style.padding = noteSize < 120 ? '8px' : '16px';
}

// 주사위가 넘어가며 바닥에 닿을 때의 '탁' 소리: 던질 때의 '타탁다닥' 중 한 번의 충돌음을 그대로 씁니다.
function playTipImpact(strength = 1) {
  try {
    ensureDiceAudio();
    if (!diceAudio || !impactNoise) return;
    diceAudio.resume().then(() => playDiceImpact(diceAudio.currentTime + 0.005, 0.38 * strength)).catch(() => {});
  } catch (_) {}
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
  const scale = diceViewScale;
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

// 시작 화면 오른쪽 위 Shop 버튼과 Shop 화면 왼쪽 위 Memo 버튼으로 두 화면을 오갑니다.
function setupModeButtons() {
  document.getElementById('shopButton').addEventListener('click', () => setShopMode(true));
  document.getElementById('memoButton').addEventListener('click', () => setShopMode(false));
}
function setShopMode(on) {
  if (writingOpen) return;
  shopMode = on;
  document.body.classList.toggle('is-shop', on);
  if (!on && !throwState) document.querySelector('.instruction').hidden = false;
}

function setupFaceButtons() {
  setActiveFace(null);
  document.querySelectorAll('.face-button').forEach(button => {
    button.addEventListener('click', () => rollDice(Number(button.dataset.face)));
  });
}
