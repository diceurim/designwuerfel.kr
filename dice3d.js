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
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-150, 700, 350);
scene.add(sun);

// p5 주사위와 같은 시선: 정지한 주사위 중심의 510 위, 오른쪽 380, 앞쪽 760에서 내려다봅니다.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
camera.position.set(380, DICE_SIZE / 2 + 510, 760);
camera.lookAt(0, DICE_SIZE / 2, 0);

// p5 회전(아래가 +Y)을 three.js 회전(위가 +Y)으로 바꿉니다.
const flipY = new THREE.Matrix4().makeScale(1, -1, 1);
function p5RotationToQuaternion([rx, ry, rz]) {
  const m = new THREE.Matrix4().makeRotationX(rx)
    .multiply(new THREE.Matrix4().makeRotationY(ry))
    .multiply(new THREE.Matrix4().makeRotationZ(rz));
  return new THREE.Quaternion().setFromRotationMatrix(flipY.clone().multiply(m).multiply(flipY));
}

let root, dice, mixer, action, clipDuration = 0;
let currentRoll = null, faceQuaternion = new THREE.Quaternion(), previousQuaternion = new THREE.Quaternion();

async function load() {
  const gltf = await new GLTFLoader().loadAsync('assets/dice-roll.glb');
  root = gltf.scene.getObjectByName('DiceRoot');
  dice = gltf.scene.getObjectByName('Dice');
  const clip = gltf.animations.find(item => item.name === 'Roll') || gltf.animations[0];
  if (!root || !dice || !clip) throw new Error('DiceRoot / Dice / Roll을 찾지 못했어요.');
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
  faceQuaternion = p5RotationToQuaternion(diceRotation);
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
    const end = throwState.end.map(angle => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    faceQuaternion = p5RotationToQuaternion(end);
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
  const scale = Math.min(innerWidth / 520, innerHeight / 760, 1.25);
  const shiftX = diceScreenShift[0] / scale, shiftY = (diceScreenShift[1] + 5) / scale;
  camera.left = -innerWidth / (2 * scale) - shiftX;
  camera.right = innerWidth / (2 * scale) - shiftX;
  camera.top = innerHeight / (2 * scale) + shiftY;
  camera.bottom = -innerHeight / (2 * scale) + shiftY;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

load().catch(error => console.warn('3D 주사위를 불러오지 못해 기존 주사위를 씁니다.', error));
