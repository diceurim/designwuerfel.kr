// Blender에서 만든 3D 주사위(assets/dice-roll.glb)를 p5 주사위 대신 그립니다.
// 굴리는 시점·결과 면·화면 이동은 지금처럼 sketch.js가 정하고, 여기서는 그 상태를 따라 모델과 애니메이션만 보여줍니다.
// GLB를 불러오지 못하면 아무것도 하지 않아 기존 p5 주사위가 그대로 보입니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BLEND_TIME = 180; // 굴리기 시작할 때 이전 자세에서 애니메이션 첫 자세로 넘어가는 시간(ms)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', zIndex: '1', pointerEvents: 'none' });

const scene = new THREE.Scene();
// 툰 셰이딩: 빛 하나로 명암을 두 단계(흰색 / 회색)로만 끊어, 노이즈 없는 흑백 2D 그림처럼 보이게 합니다.
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(-150, 700, 350);
scene.add(sun, new THREE.AmbientLight(0xffffff, 0.2));
// Shop 화면의 실물 주사위(원래 재질)가 금속·아크릴 반사를 갖도록 실내 조명 환경을 비춥니다. 툰 재질에는 영향이 없습니다.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const TOON_STEPS = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([90, 255]), 2, 1, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();
const TOON_BODY = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: TOON_STEPS });
// 숫자 눈(파인 홈): 평평한 면과 달리 홈 안쪽은 표면이 기울어 있으므로, 기운 부분을 검은 선으로 칠해 눈을 또렷하게 합니다.
// ENGRAVE_EDGE를 낮추면 선이 가늘어지고, 높이면 두꺼워집니다(0~1, 1에 가까울수록 두꺼움).
const ENGRAVE_EDGE = 0.985;
TOON_BODY.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObjectNormal;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjectNormal = objectNormal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObjectNormal;')
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      vec3 axis = abs(normalize(vObjectNormal));
      if (max(axis.x, max(axis.y, axis.z)) < ${ENGRAVE_EDGE.toFixed(4)}) gl_FragColor.rgb = vec3(0.0);`);
};
const TOON_INK = new THREE.MeshBasicMaterial({ color: 0x000000 });
// 바깥 테두리: 뒤에서 비치는 빛이 가장자리에 맺힌 것처럼 흰 선을 두릅니다.
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
// Shop 화면의 패널: 속에 은은한 광원이 든 반투명 무광 아크릴.
// - 패널 가운데가 가장 밝고 가장자리로 갈수록 어두워지는 빛(자체발광 그라데이션)
// - 가장자리로 갈수록 따뜻한 베이지·토프빛으로 가라앉아, 속이 깊이 비치는 듯한 느낌(실제로 비치면 안쪽 뼈대가 어지럽게 보여 무광으로 막아 둡니다)
// - 빛을 덜 받는 면도 회색으로 죽지 않도록, 속에서 투과된 따뜻한 빛이 패널 전체에 깔려 있습니다
// - 패널 둘레에는 속의 빛이 새어 나오는 얇은 테두리 빛
// - 표면에는 은은한 서리 낀 듯한 노이즈
// - 파인 눈은 얇아서 빛이 더 비친 것처럼 따뜻하게 빛남
// 패널은 반지름 약 54mm, 윗면은 중심에서 약 60.5mm, 눈의 바닥은 약 55.5mm에 있습니다(모델 기준, 미터 단위).
const PANEL_RADIUS = 0.054;
const ACRYLIC = new THREE.MeshPhysicalMaterial({
  color: 0xece2d6, roughness: 0.85, envMapIntensity: 0.45,
  emissive: 0xffe4c8, emissiveIntensity: 1,
  sheen: 0.35, sheenColor: 0xfff1e2, sheenRoughness: 0.85,
});
// 밝기 단계(0: 윗면 1 → 1: 윗면 6). 숫자가 클수록 빛이 세지고 패널이 더 투명하게 빛을 통과시키는 것처럼 보입니다.
const GLOW_LEVEL = { value: 0 };
ACRYLIC.onBeforeCompile = shader => {
  shader.uniforms.uGlowLevel = GLOW_LEVEL;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObjectNormal;\nvarying vec3 vObjectPosition;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjectNormal = objectNormal;\nvObjectPosition = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vObjectNormal;
      varying vec3 vObjectPosition;
      uniform float uGlowLevel;
      float acrylicHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 axis = abs(normalize(vObjectNormal));
      vec3 reach = abs(vObjectPosition);
      float wall = 1.0 - smoothstep(${ENGRAVE_EDGE.toFixed(4)} - 0.02, ${ENGRAVE_EDGE.toFixed(4)}, max(axis.x, max(axis.y, axis.z)));
      float floorPit = 1.0 - smoothstep(0.0585, 0.0598, max(reach.x, max(reach.y, reach.z)));
      float pit = max(wall, floorPit);
      // 패널 중심에서 얼마나 떨어졌는지(0: 가운데, 1: 가장자리)
      vec2 across = reach.x > reach.y && reach.x > reach.z ? vObjectPosition.yz : reach.y > reach.z ? vObjectPosition.xz : vObjectPosition.xy;
      float edge = clamp(length(across) / ${PANEL_RADIUS}, 0.0, 1.0);
      float grain = acrylicHash(floor(vObjectPosition * 6000.0));
      diffuseColor.rgb *= 0.92 + 0.14 * grain;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.74, 0.58), pit * 0.75);
      // 밝아질수록(투과도가 오를수록) 가장자리가 덜 가라앉고, 패널 바탕은 빛에 묻혀 옅어집니다.
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.69, 0.6), smoothstep(0.35, 1.0, edge) * 0.55 * (1.0 - 0.6 * uGlowLevel));
      diffuseColor.rgb *= 1.0 - 0.15 * uGlowLevel;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float glow = (0.2 + 0.12 * uGlowLevel) + pow(1.0 - edge, 1.5 - 0.4 * uGlowLevel) * (0.32 + 0.2 * uGlowLevel) + smoothstep(0.9, 1.0, edge) * (0.18 + 0.1 * uGlowLevel);
      // 밝아져도 하얗게 날아가지 않고 따뜻한 빛으로 남도록, 빛 색을 단계에 따라 살구빛 쪽으로 기울입니다.
      totalEmissiveRadiance *= glow * (0.92 + 0.12 * grain) * mix(vec3(1.0), vec3(1.0, 0.84, 0.66), uGlowLevel);
      totalEmissiveRadiance += vec3(0.32, 0.2, 0.1) * pit * (1.0 - edge * 0.5) * (1.0 + 0.8 * uGlowLevel);
      // 밝을 때 눈(얇은 곳)은 바탕보다 한층 밝게 비쳐 숫자가 잘 보입니다.
      totalEmissiveRadiance += vec3(0.42, 0.34, 0.25) * pit * uGlowLevel;`);
};
// 아이보리 면은 흰 툰 재질, 금속 테두리는 먹색으로 바꾸고, 가장 바깥 모양을 조금 키운 뒷면으로 흰 외곽선을 그립니다.
// Shop 화면에서 되돌릴 수 있도록 원래 재질과 툰 재질을 둘 다 기억해 둡니다.
let toonMeshes = [], outline = null, showingReal = false, steelMaterials = [];
// 주사위 속 광원: 패널 사이 틈으로 보이는 안쪽 면을 따뜻하게 밝혀, 패널 둘레가 은은하게 빛나 보이게 합니다(Shop 화면에서만 켭니다).
const innerLight = new THREE.PointLight(0xffe2bf, 0, 0, 0);
// Shop 화면의 보조광: 화면 왼쪽 패널을 앞쪽에서 비춰, 윗면과 비슷한 밝기로 둡니다(오른쪽 패널만 그늘을 받음).
const fillLight = new THREE.DirectionalLight(0xfff6ec, 0);
fillLight.position.set(-60, 260, 800);
scene.add(fillLight);
function applyToon(model) {
  const meshes = toonMeshes;
  model.traverse(child => { if (child.isMesh) meshes.push(child); });
  const size = mesh => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length(); };
  // 외곽선은 가장 바깥 모양 하나에만 둘러, 안쪽 면 경계에는 흰 선이 생기지 않게 합니다.
  const outer = meshes.reduce((a, b) => size(b) > size(a) ? b : a);
  for (const mesh of meshes) {
    const names = [].concat(mesh.material).map(material => material.name || '').join(' ');
    mesh.userData.realMaterial = /ivory|body/i.test(names) ? ACRYLIC : mesh.material;
    // 금속 테두리는 거울처럼 검게 비치지 않도록 새틴처럼 조금 흐리고 밝게 둡니다.
    if (mesh.material.metalness !== undefined && !/ivory|body/i.test(names)) {
      mesh.material.roughness = Math.max(mesh.material.roughness, 0.45);
      mesh.material.color.multiplyScalar(1.1);
      mesh.material.envMapIntensity = 1.6;
      steelMaterials.push(mesh.material);
    }
    mesh.userData.toonMaterial = /ivory|body/i.test(names) ? TOON_BODY : TOON_INK;
    mesh.material = mesh.userData.toonMaterial;
  }
  outline = new THREE.Mesh(outer.geometry, OUTLINE);
  outline.scale.setScalar(1.03);
  outer.add(outline);
}

// p5 주사위와 같은 시선: 정지한 주사위 중심의 510 위, 오른쪽 380, 앞쪽 760에서 내려다봅니다.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
camera.position.set(380, DICE_SIZE / 2 + 510, 760);
camera.lookAt(0, DICE_SIZE / 2, 0);

// GLB 모델에서 각 숫자 눈이 향하는 방향(모델 기준). 결과 면 번호가 W(1)·Ü(2)·R(3)·F(4)·E(5)·L(6) 화면과 같도록 맞춥니다.
const GLB_FACE_DIRECTIONS = {
  1: [0, 1, 0], 6: [0, -1, 0],
  2: [0, 0, 1], 5: [0, 0, -1],
  3: [-1, 0, 0], 4: [1, 0, 0],
};
const UP = new THREE.Vector3(0, 1, 0);
// p5 회전 기준으로 위를 향하는 면을 찾고, GLB에서 같은 숫자의 눈이 위를 향하는 자세를 만듭니다. 옆 방향은 90° 단위로 무작위입니다.
function topFaceQuaternion(rotation) {
  const top = FACE_LAYOUT.reduce((best, face) => rotateVector(face.normal, rotation)[1] < rotateVector(best.normal, rotation)[1] ? face : best).value;
  const toUp = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...GLB_FACE_DIRECTIONS[top]), UP);
  const yaw = new THREE.Quaternion().setFromAxisAngle(UP, Math.floor(Math.random() * 4) * Math.PI / 2);
  return yaw.multiply(toUp);
}

let root, dice, mixer, action, clipDuration = 0;
let currentRoll = null, faceQuaternion = new THREE.Quaternion(), previousQuaternion = new THREE.Quaternion();

async function load() {
  const gltf = await new GLTFLoader().loadAsync('assets/dice-roll.glb');
  root = gltf.scene.getObjectByName('DiceRoot');
  dice = gltf.scene.getObjectByName('Dice');
  const clip = gltf.animations.find(item => item.name === 'Roll') || gltf.animations[0];
  if (!root || !dice || !clip) throw new Error('DiceRoot / Dice / Roll을 찾지 못했어요.');
  applyToon(dice);
  dice.add(innerLight);
  // 모델 한 변을 p5 주사위와 같은 크기(DICE_SIZE)로 맞춥니다.
  const edge = root.userData.edge_length_m || new THREE.Box3().setFromObject(dice).getSize(new THREE.Vector3()).x;
  gltf.scene.scale.setScalar(DICE_SIZE / edge);
  stage.add(gltf.scene);
  scene.add(stage);
  mixer = new THREE.AnimationMixer(gltf.scene);
  action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  clipDuration = clip.duration;
  mixer.setTime(clipDuration - 1e-4);
  faceQuaternion = topFaceQuaternion(diceRotation);
  dice.quaternion.copy(faceQuaternion);
  // 굴림 애니메이션이 끝났을 때의 회전(착지할 숫자를 미리 계산할 때 씁니다).
  root.getWorldQuaternion(restRootQuaternion);
  // 정지한 주사위 중심이 무대 원점에서 얼마나 떨어져 있는지(Shop 화면에서 칸 위치를 맞출 때 씁니다).
  new THREE.Box3().setFromObject(dice).getCenter(restCenter);
  document.body.append(renderer.domElement);
  window.glbDiceReady = true;
  resize();
  renderer.setAnimationLoop(render);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

// Shop 화면(배경이 절반 넘게 밝아졌을 때)에서는 툰 셰이딩과 흰 외곽선을 빼고 원래 재질로 보여줍니다.
function updateLook() {
  const real = shopProgress > .5;
  if (real === showingReal) return;
  showingReal = real;
  for (const mesh of toonMeshes) mesh.material = real ? mesh.userData.realMaterial : mesh.userData.toonMaterial;
  outline.visible = !real;
  // 원래 재질은 실내 조명 환경도 받으므로, 직사광을 줄여 흰 면이 하얗게 날아가지 않게 합니다.
  sun.intensity = real ? 0.9 : 3;
  if (!real) innerLight.intensity = 0;
  fillLight.intensity = real ? 0.75 : 0;
}

function render() {
  // 창 크기가 바뀌는 도중의 resize 이벤트만 받고 끝난 경우에도 캔버스가 화면 크기를 따라가게 합니다.
  const drawn = renderer.getSize(new THREE.Vector2());
  if (drawn.x !== innerWidth || drawn.y !== innerHeight) resize();
  updateLook();
  // 새로 굴리기 시작했으면, 이번 결과 면에 맞는 자세를 모델에 미리 돌려 둡니다.
  if (throwState && throwState !== currentRoll) {
    currentRoll = throwState;
    previousQuaternion.copy(dice.getWorldQuaternion(new THREE.Quaternion()));
    faceQuaternion = topFaceQuaternion(throwState.end);
    // Shop 화면에서 던질 때는 착지할 숫자의 멈춤 각도를 처음부터 자세에 담아, 착지 후에 따로 돌지 않게 합니다.
    throwYaw = shopMode ? REST_YAWS[(currentTopFace(restRootQuaternion.clone().multiply(faceQuaternion)) - 1) % REST_YAWS.length] : 0;
  }
  if (throwState) {
    const elapsed = millis() - throwState.startTime;
    mixer.setTime(Math.min(clipDuration - 1e-4, elapsed / THROW_DURATION * clipDuration));
    const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
    const target = yawAround(throwYaw).multiply(rootQuaternion).multiply(faceQuaternion);
    const blend = Math.min(1, elapsed / BLEND_TIME);
    const shown = previousQuaternion.clone().slerp(target, blend * blend * (3 - 2 * blend));
    dice.quaternion.copy(rootQuaternion.invert().multiply(shown));
  } else {
    currentRoll = null;
    mixer.setTime(clipDuration - 1e-4);
    dice.quaternion.copy(faceQuaternion);
  }
  updateShop();
  // 화면 크기에 맞춘 크기와, 기록 화면에서 왼쪽 아래로 옮겨 가는 이동을 p5와 똑같이 맞춥니다.
  const scale = diceViewScale;
  const shiftX = diceScreenShift[0] / scale, shiftY = (diceScreenShift[1] + 5) / scale;
  camera.left = -innerWidth / (2 * scale) - shiftX;
  camera.right = innerWidth / (2 * scale) - shiftX;
  camera.top = innerHeight / (2 * scale) + shiftY;
  camera.bottom = -innerHeight / (2 * scale) + shiftY;
  camera.updateProjectionMatrix();
  // 휴대폰에서 구석으로 내려간 작은 주사위는 스크롤되는 내용에 가려지지 않게 화면 위층에 그립니다.
  renderer.domElement.style.zIndex = innerWidth <= 600 && !lollingWorld && writingViewProgress > .5 ? '6' : '1';
  renderer.render(scene, camera);
}

// ───────── Shop 화면: 손으로 만지는 실물 주사위 ─────────
// 이 주사위는 윗면 숫자가 1 → 6으로 커질수록 속의 조명이 밝아지는 조명 주사위입니다.
// - 주사위를 잡고 상하좌우로 밀면(또는 방향키) 그쪽으로 한 칸 넘어가며 윗면 숫자와 밝기가 바뀝니다.
// - 위로 힘껏 들어 올렸다가 놓으면 던져집니다(클릭·스페이스바로는 던지지 않음).
// - 바닥은 가로 5칸 × 앞뒤 6칸(뒤로 2칸, 앞으로 3칸)의 제한된 영역이고, 그 밖으로는 보이지 않는 벽에 막혀 살짝 들썩이다 제자리로 돌아옵니다.
// - 뒤로 갈수록 원근감으로 조금(최대 12%) 작아지고, 앞(화면 아래)으로 다가올수록 더 크게(최대 30%) 커집니다.
// - 윗면 숫자마다 정해진 5가지 멈춤 각도 중 하나가 있고(같은 숫자는 늘 같은 각도), 넘어가는 동안 그 각도로 이어서 돌아갑니다.
const HALF = DICE_SIZE / 2;
const GRID = { minX: -2, maxX: 2, minZ: -2, maxZ: 3 };   // 칸 단위(한 칸 = 주사위 한 변). 앞(+Z, 화면 아래)으로만 넓게
// 멈춘 주사위가 돌아 앉는 각도(°): 윗면 1·2·3·4·5는 차례로, 6은 다시 첫 각도부터 반복합니다.
const REST_YAWS = [0, 16, -12, 28, -22].map(degree => degree * Math.PI / 180);
const SETTLE_TIME = 110;                                 // 돌아 앉는 빠르기(ms, 작을수록 빠름)
const TIP_TIME = 420, BUMP_TIME = 320;                    // 한 칸 넘어가는 시간, 벽에 막혔을 때 들썩이는 시간(ms)
const LIFT_START = 140, LIFT_MAX = 320, THROW_LIFT = 60;  // 들어 올리기 시작하는 위쪽 드래그(px), 최대 높이, 던져지는 최소 높이
const SCREEN_RIGHT = new THREE.Vector3(0.894, 0, -0.447); // 화면 오른쪽·위쪽(안쪽)에 해당하는 바닥 방향
const SCREEN_BACK = new THREE.Vector3(-0.447, 0, -0.894);
const stage = new THREE.Group();
const restCenter = new THREE.Vector3();
let shopCell = [0, 0], tipState = null, drag = null, heldLift = 0, throwLift = 0, wasShop = false, shopYaw = 0, throwYaw = 0;
const restRootQuaternion = new THREE.Quaternion();
let shownGlow = 0, lastFrame = performance.now();

const depthScale = z => z < 0 ? 1 + Math.max(z / (2 * DICE_SIZE), -1) * 0.12 : 1 + Math.min(z / DICE_SIZE, 3) * 0.1;
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const yawAround = angle => new THREE.Quaternion().setFromAxisAngle(UP_AXIS, angle);
const shopReady = () => shopMode && shopProgress === 1 && !throwState && !tipState && !writingOpen && window.glbDiceReady;

// 위를 향한 면의 숫자(GLB 모델 기준). 자세를 주지 않으면 지금 보이는 자세로 계산합니다.
function currentTopFace(q = dice.getWorldQuaternion(new THREE.Quaternion())) {
  let best = 1, bestY = -2;
  for (const [face, dir] of Object.entries(GLB_FACE_DIRECTIONS)) {
    const y = new THREE.Vector3(...dir).applyQuaternion(q).y;
    if (y > bestY) { bestY = y; best = Number(face); }
  }
  return best;
}

// 화면에서 민 방향을 바닥의 네 방향 중 가장 가까운 쪽으로 바꿔 한 칸 넘깁니다.
function tipScreen(sx, sy) {
  const w = SCREEN_RIGHT.clone().multiplyScalar(sx).add(SCREEN_BACK.clone().multiplyScalar(-sy));
  const dir = Math.abs(w.x) > Math.abs(w.z) ? [Math.sign(w.x), 0] : [0, Math.sign(w.z)];
  const next = [shopCell[0] + dir[0], shopCell[1] + dir[1]];
  // 휴대폰처럼 좁은 화면에서는 좌우를 한 칸씩만 열어 주사위가 화면 밖으로 나가지 않게 합니다.
  const sideLimit = innerWidth <= 600 ? 1 : GRID.maxX;
  const bump = next[0] < -sideLimit || next[0] > sideLimit || next[1] < GRID.minZ || next[1] > GRID.maxZ;
  const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
  const from = rootQuaternion.multiply(faceQuaternion);
  // 넘어간 뒤 위로 올 숫자를 미리 구해, 넘어가는 동안 그 숫자의 멈춤 각도로 서서히 돌아가게 합니다.
  const axis = UP_AXIS.clone().cross(new THREE.Vector3(dir[0], 0, dir[1]));
  const landed = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(from);
  const yawTo = bump ? shopYaw : REST_YAWS[(currentTopFace(landed) - 1) % REST_YAWS.length];
  tipState = { start: performance.now(), dir, bump, yawFrom: shopYaw, yawTo, from };
}

function updateShop() {
  const now = performance.now(), dt = Math.min(now - lastFrame, 100);
  lastFrame = now;
  if (!shopMode) {
    // 시작 화면으로 돌아가면 가운데 칸, 원래 크기로 되돌립니다.
    if (wasShop) {
      wasShop = false; shopCell = [0, 0]; tipState = null; drag = null; heldLift = 0; shopYaw = 0;
      if (!throwState) { positionX = 0; positionZ = 0; lift = 0; }
      diceDepthScale = 1;
    }
    stage.position.set(0, 0, 0);
    stage.scale.setScalar(1);
    return;
  }
  wasShop = true;
  const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
  const center = new THREE.Vector3(shopCell[0] * DICE_SIZE, HALF, shopCell[1] * DICE_SIZE);
  let scale = depthScale(center.z);
  if (tipState) {
    // 바닥에 닿은 앞쪽 모서리를 축으로 90° 넘어갑니다(벽에 막히면 살짝 들렸다 돌아옴).
    const t = Math.min(1, (now - tipState.start) / (tipState.bump ? BUMP_TIME : TIP_TIME));
    const eased = tipState.bump ? Math.sin(Math.PI * t) * 0.32 : (1 - Math.cos(Math.PI * t)) / 2 * Math.PI / 2;
    const d = new THREE.Vector3(tipState.dir[0], 0, tipState.dir[1]);
    const axis = new THREE.Vector3(0, 1, 0).cross(d);
    const pivot = center.clone().add(d.clone().multiplyScalar(HALF)).setY(0);
    center.sub(pivot).applyAxisAngle(axis, eased).add(pivot);
    scale = depthScale(center.z);
    // 넘어가는 동안 멈춤 각도도 이전 숫자의 각도에서 다음 숫자의 각도로 이어서 돌아갑니다(벽에 막혀 들썩일 때는 그대로).
    const progress = (1 - Math.cos(Math.PI * t)) / 2;
    const yaw = tipState.yawFrom + (tipState.yawTo - tipState.yawFrom) * progress;
    const turned = yawAround(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(axis, eased)).multiply(tipState.from);
    dice.quaternion.copy(rootQuaternion.clone().invert().multiply(turned));
    if (t === 1) {
      if (!tipState.bump) {
        shopCell = [shopCell[0] + tipState.dir[0], shopCell[1] + tipState.dir[1]];
        faceQuaternion = rootQuaternion.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(tipState.from));
      }
      // 면이 바닥에 닿는 순간 '탁'(벽에 막혀 되돌아올 때는 작게)
      playTipImpact(tipState.bump ? 0.5 : 1);
      shopYaw = tipState.yawTo;
      dice.quaternion.copy(rootQuaternion.clone().invert().multiply(yawAround(shopYaw)).multiply(rootQuaternion).multiply(faceQuaternion));
      tipState = null;
    }
  } else if (throwState) {
    shopYaw = throwYaw;
  } else {
    // 멈춰 있을 때: 윗면 숫자에 맞는 각도로 살짝 돌아 앉습니다.
    const targetYaw = REST_YAWS[(currentTopFace() - 1) % REST_YAWS.length];
    shopYaw += (targetYaw - shopYaw) * (1 - Math.exp(-dt / SETTLE_TIME));
    dice.quaternion.copy(rootQuaternion.clone().invert().multiply(yawAround(shopYaw)).multiply(rootQuaternion).multiply(faceQuaternion));
  }
  // 손을 놓으면 들린 높이가 바닥으로 내려앉습니다.
  if (!drag?.lifting) heldLift += (0 - heldLift) * (1 - Math.exp(-dt / 90));
  if (throwState) {
    // 던지는 동안은 GLB 굴림 애니메이션이 높이를 맡고, 들었던 높이는 처음 0.3초 동안 이어서 내려옵니다.
    const fade = Math.max(0, 1 - (millis() - throwState.startTime) / 300);
    stage.position.set(center.x - restCenter.x * scale, throwLift * fade * fade, center.z - restCenter.z * scale);
  } else {
    stage.position.set(center.x - restCenter.x * scale, center.y - HALF * scale + heldLift, center.z - restCenter.z * scale);
    // 바닥 그림자(p5)도 같은 자리·높이·크기를 따라갑니다.
    positionX = center.x; positionZ = center.z; lift = center.y - HALF + heldLift;
  }
  stage.scale.setScalar(scale);
  diceDepthScale = scale;
  // 윗면 숫자가 클수록 속의 조명이 밝아지고, 숫자가 바뀌면 천천히 그 밝기로 옮겨 갑니다.
  // 공중에서 구르는 동안에는 밝기·배경을 그대로 두고, 착지한 뒤에 새 숫자의 밝기로 옮겨 갑니다.
  if (!throwState) shownGlow += ((currentTopFace() - 1) / 5 - shownGlow) * (1 - Math.exp(-dt / 380));
  // 윗면 1의 밝기(emissiveIntensity 1, 속 광원 2.2)에서 시작해 6으로 갈수록 훨씬 밝아집니다.
  GLOW_LEVEL.value = shownGlow;
  diceGlowLevel = shownGlow;
  if (shopProgress > .5) {
    // 방이 어두워지는 만큼 바깥 조명·반사도 줄여, 패널이 속의 빛으로만 빛나고 눈이 또렷이 보이게 합니다.
    const room = 1 - 0.75 * shownGlow;
    sun.intensity = 0.9 * room;
    fillLight.intensity = 0.75 * room;
    ACRYLIC.envMapIntensity = 0.45 * room;
    for (const material of steelMaterials) material.envMapIntensity = 1.6 * (1 - 0.5 * shownGlow);
  }
  ACRYLIC.emissiveIntensity = 1 + 0.75 * shownGlow;
  if (shopProgress > .5) innerLight.intensity = 2.2 + 3 * shownGlow;
}

const raycaster = new THREE.Raycaster(), pointerNdc = new THREE.Vector2();
function hitsDice(event) {
  pointerNdc.set(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  return raycaster.intersectObjects(toonMeshes, false).length > 0;
}
addEventListener('pointerdown', event => {
  if (!shopReady() || event.target.tagName !== 'CANVAS' || !hitsDice(event)) return;
  drag = { x: event.clientX, y: event.clientY, lifting: false };
  document.body.style.cursor = 'grabbing';
});
addEventListener('pointermove', event => {
  if (!drag) {
    document.body.style.cursor = shopReady() && event.target.tagName === 'CANVAS' && hitsDice(event) ? 'grab' : '';
    return;
  }
  const up = drag.y - event.clientY;
  if (!drag.lifting && up > LIFT_START && up > Math.abs(event.clientX - drag.x)) drag.lifting = true;
  if (drag.lifting) heldLift = THREE.MathUtils.clamp((up - LIFT_START * 0.6) * 1.1, 0, LIFT_MAX);
});
function endDrag(event, cancelled) {
  if (!drag) return;
  const d = drag;
  drag = null;
  document.body.style.cursor = '';
  if (cancelled) return;
  if (d.lifting) {
    // 충분히 들어 올렸다가 놓으면 던집니다. 덜 들었으면 그냥 내려놓습니다.
    if (heldLift > THROW_LIFT) { throwLift = heldLift; heldLift = 0; rollDice(); }
    return;
  }
  const dx = event.clientX - d.x, dy = event.clientY - d.y;
  if (Math.hypot(dx, dy) > 25) tipScreen(dx, dy);
}
addEventListener('pointerup', event => endDrag(event, false));
addEventListener('pointercancel', event => endDrag(event, true));
addEventListener('keydown', event => {
  const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!keys[event.key] || !shopReady() || drag) return;
  event.preventDefault();
  tipScreen(...keys[event.key]);
});

load().catch(error => console.warn('3D 주사위를 불러오지 못해 기존 주사위를 씁니다.', error));
