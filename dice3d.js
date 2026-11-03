// Blender에서 만든 3D 주사위(assets/dice-roll.glb)를 p5 주사위 대신 그립니다.
// 굴리는 시점·결과 면·화면 이동은 지금처럼 sketch.js가 정하고, 여기서는 그 상태를 따라 모델과 애니메이션만 보여줍니다.
// GLB를 불러오지 못하면 아무것도 하지 않아 기존 p5 주사위가 그대로 보입니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
// 아이보리 면은 흰 툰 재질, 금속 테두리는 먹색으로 바꾸고, 가장 바깥 모양을 조금 키운 뒷면으로 흰 외곽선을 그립니다.
function applyToon(model) {
  const meshes = [];
  model.traverse(child => { if (child.isMesh) meshes.push(child); });
  const size = mesh => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length(); };
  // 외곽선은 가장 바깥 모양 하나에만 둘러, 안쪽 면 경계에는 흰 선이 생기지 않게 합니다.
  const outer = meshes.reduce((a, b) => size(b) > size(a) ? b : a);
  for (const mesh of meshes) {
    const names = [].concat(mesh.material).map(material => material.name || '').join(' ');
    mesh.material = /ivory|body/i.test(names) ? TOON_BODY : TOON_INK;
  }
  const outline = new THREE.Mesh(outer.geometry, OUTLINE);
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
  // 모델 한 변을 p5 주사위와 같은 크기(DICE_SIZE)로 맞춥니다.
  const edge = root.userData.edge_length_m || new THREE.Box3().setFromObject(dice).getSize(new THREE.Vector3()).x;
  gltf.scene.scale.setScalar(DICE_SIZE / edge);
  scene.add(gltf.scene);
  mixer = new THREE.AnimationMixer(gltf.scene);
  action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  clipDuration = clip.duration;
  mixer.setTime(clipDuration - 1e-4);
  faceQuaternion = topFaceQuaternion(diceRotation);
  dice.quaternion.copy(faceQuaternion);
  document.body.append(renderer.domElement);
  window.glbDiceReady = true;
  resize();
  renderer.setAnimationLoop(render);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

function render() {
  // 새로 굴리기 시작했으면, 이번 결과 면에 맞는 자세를 모델에 미리 돌려 둡니다.
  if (throwState && throwState !== currentRoll) {
    currentRoll = throwState;
    previousQuaternion.copy(dice.getWorldQuaternion(new THREE.Quaternion()));
    faceQuaternion = topFaceQuaternion(throwState.end);
  }
  if (throwState) {
    const elapsed = millis() - throwState.startTime;
    mixer.setTime(Math.min(clipDuration - 1e-4, elapsed / THROW_DURATION * clipDuration));
    const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
    const target = rootQuaternion.clone().multiply(faceQuaternion);
    const blend = Math.min(1, elapsed / BLEND_TIME);
    const shown = previousQuaternion.clone().slerp(target, blend * blend * (3 - 2 * blend));
    dice.quaternion.copy(rootQuaternion.invert().multiply(shown));
  } else {
    currentRoll = null;
    mixer.setTime(clipDuration - 1e-4);
    dice.quaternion.copy(faceQuaternion);
  }
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

load().catch(error => console.warn('3D 주사위를 불러오지 못해 기존 주사위를 씁니다.', error));
