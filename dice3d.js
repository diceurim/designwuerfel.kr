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
// 윗면 3~6에서 주사위 밝기만 낮추는 양(단계 단위). 배경 밝기에는 영향 없음
const DICE_DIM_ABOVE_TWO = 0.1;
// 윗면 1(조명 꺼짐) 모습의 정도: 1이면 꺼진 제품 사진처럼 미색 아이보리 패널 + 새틴 금속, 윗면 2 이상은 0.
const OFF_LOOK = { value: 0 };
const OFF_IVORY = [0.88, 0.85, 0.78];   // 꺼졌을 때 패널 바탕색(미색)
const OFF_GLOW = 0.22;                  // 꺼졌을 때 남기는 패널 빛(밝기 유지용, 색은 중성 미색)
const OFF_STEEL_ROUGHNESS = 0.62, OFF_STEEL_SHINE = 1.0;   // 꺼졌을 때 새틴 금속: 거칠기 ↑, 반사 ↓
// 꺼졌을 때 패널의 반투명 아크릴 느낌(서리 낀 유리처럼). 0이면 지금처럼 불투명.
//  milk: 우윳빛으로 밝고 부드럽게, rim: 얇은 가장자리로 빛이 비쳐 밝아짐, seeThrough: 중앙의 약한 비침(0~1), 가장자리는 더 불투명
// B-1: 밝은 중앙, 옅은 회색 가장자리, 약한 비침. 윗면 1에서만 적용.
const OFF_FROST = { milk: 1, rim: 0.06, seeThrough: 0.065 };
const FROST_MILK = { value: 0 }, FROST_RIM = { value: 0 }, FROST_SEE = { value: 0 };
ACRYLIC.onBeforeCompile = shader => {
  shader.uniforms.uGlowLevel = GLOW_LEVEL;
  shader.uniforms.uOff = OFF_LOOK;
  shader.uniforms.uFrostMilk = FROST_MILK;
  shader.uniforms.uFrostRim = FROST_RIM;
  shader.uniforms.uFrostSee = FROST_SEE;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObjectNormal;\nvarying vec3 vObjectPosition;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjectNormal = objectNormal;\nvObjectPosition = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vObjectNormal;
      varying vec3 vObjectPosition;
      uniform float uGlowLevel;
      uniform float uOff;
      uniform float uFrostMilk, uFrostRim, uFrostSee;
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
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.74, 0.58), pit * 0.75 * (1.0 - uOff));
      // 밝아질수록(투과도가 오를수록) 가장자리가 덜 가라앉습니다.
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.69, 0.6), smoothstep(0.35, 1.0, edge) * 0.55 * (1.0 - 0.6 * uGlowLevel) * (1.0 - 0.7 * uOff));
      // 윗면 1(꺼짐): 미색 아이보리 바탕, 눈은 살구빛 대신 살짝 그늘진 같은 색
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${OFF_IVORY.join(", ")}) * (0.97 + 0.06 * grain) * (1.0 - 0.1 * pit), uOff);
      // B-1: 중앙은 은은한 미색, 가장자리는 옅은 웜그레이으로 부드럽게 가라앉음.
      float frostEdge = smoothstep(0.38, 1.0, edge);
      vec3 frostColor = mix(vec3(0.96, 0.935, 0.89), vec3(0.85, 0.825, 0.78), frostEdge);
      frostColor *= (0.992 + 0.016 * grain) * (1.0 - 0.055 * pit);
      diffuseColor.rgb = mix(diffuseColor.rgb, frostColor, uFrostMilk * uOff);
      // 두꺼운 가장자리는 중앙보다 덜 비침. 내부 구조가 선명하게 드러나지 않도록 제한.
      diffuseColor.a = 1.0 - uFrostSee * uOff * (1.0 - 0.55 * frostEdge);
`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float glow = (0.2 + 0.12 * uGlowLevel) + pow(1.0 - edge, 1.5 - 0.4 * uGlowLevel) * (0.32 + 0.2 * uGlowLevel) + smoothstep(0.9, 1.0, edge) * (0.18 + 0.1 * uGlowLevel);
      // 밝아져도 하얗게 날아가지 않고 따뜻한 빛으로 남도록, 빛 색을 단계에 따라 살구빛 쪽으로 기울입니다.
      totalEmissiveRadiance *= glow * (0.92 + 0.12 * grain) * mix(vec3(1.0), vec3(1.0, 0.84, 0.66), uGlowLevel);
      totalEmissiveRadiance += vec3(0.32, 0.2, 0.1) * pit * (1.0 - edge * 0.5) * (1.0 + 0.8 * uGlowLevel);
      // 밝을 때 눈(얇은 곳)은 바탕보다 한층 밝게 비쳐 숫자가 잘 보입니다.
      totalEmissiveRadiance += vec3(0.42, 0.34, 0.25) * pit * uGlowLevel;
      // 윗면 1(꺼짐): 빛나는 느낌 없이 고르게 밝은 미색 패널(눈의 빛은 끄고, 패널 빛은 중성 미색으로 약하게)
      totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(${OFF_IVORY.join(", ")}) * ${OFF_GLOW.toFixed(3)} * (0.75 + 0.25 * (1.0 - edge)) * (1.0 - 0.6 * pit), uOff);
      // B-1의 미색 산란광: 패널 색조만 따뜻하게, 산란광 세기는 유지.
      vec3 frostScatter = vec3(0.96, 0.935, 0.89) * ${OFF_GLOW.toFixed(3)} * (1.0 - 0.12 * frostEdge) * (1.0 - 0.35 * pit);
      totalEmissiveRadiance = mix(totalEmissiveRadiance, frostScatter, uFrostMilk * uOff);
      // 얇은 가장자리로 빛이 비쳐 은은하게 밝아짐(꺼졌을 때만)
      totalEmissiveRadiance += vec3(1.0, 0.98, 0.95) * uFrostRim * uOff * smoothstep(0.55, 1.0, edge) * 0.35;`);
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
  // 주사위 실제 모양(둥근 모서리)의 가장 먼 점까지 거리: 화면에 조금이라도 보이는지 판단할 때 씁니다.
  dice.updateWorldMatrix(true, true);
  const restCenterWorld = new THREE.Box3().setFromObject(dice).getCenter(new THREE.Vector3()), vertex = new THREE.Vector3();
  dice.traverse(child => {
    if (!child.isMesh || child === outline) return;
    const position = child.geometry.attributes.position;
    for (let i = 0; i < position.count; i += 3) diceRadius = Math.max(diceRadius, vertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld).distanceTo(restCenterWorld));
  });
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

// ───────── Shop 화면: 주사위 외곽의 역광과 그림자 ─────────
// 주사위만 따로 그린 뒤 그 실루엣을 흐려서, 외곽의 어느 쪽이 빛을 향하는지 화면에서 계산합니다.
// 왼쪽 위 외곽에는 흰 역광이 들어와 경계가 살짝 풀리고, 오른쪽·아래 외곽에는 진한 그림자 선이 생깁니다.
const BACKLIGHT = {
  blur: 3.2, minBlur: 1.6,      // 실루엣을 흐리는 정도(원근·화면 배율 1에서 CSS 픽셀). 휴대폰에서는 주사위 크기에 비례해 줄어듭니다.
  light: [-0.75, 0.66],         // 빛이 오는 화면 방향(왼쪽 위)
  rimAmount: 0.95, rimReach: 0.97, rimSoft: 0.2,      // 흰 역광: 세기, 안쪽으로 들어오는 폭, 경계가 풀리는 정도
  shadowAmount: 0.96, shadowInk: 0.04, shadowReach: 0.94, shadowSoft: 0.09, // 그림자 선: 세기, 색(선형 밝기), 안쪽으로 들어오는 폭, 경계가 풀리는 정도
};
const screenScene = new THREE.Scene(), screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const screenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
screenQuad.frustumCulled = false;
screenScene.add(screenQuad);
const SCREEN_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const screenPass = (uniforms, fragmentShader) => new THREE.ShaderMaterial({ uniforms, fragmentShader, vertexShader: SCREEN_VERT, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
const diceTarget = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType });
const blurTargetA = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }), blurTargetB = blurTargetA.clone();
// 실루엣 흐리기. 첫 번째(가로) 패스는 주사위의 알파를, 두 번째(세로) 패스는 앞 결과의 r을 읽습니다.
const blurPass = screenPass({ tMap: { value: null }, uStep: { value: new THREE.Vector2() }, uFromAlpha: { value: 0 } }, `
  varying vec2 vUv;
  uniform sampler2D tMap;
  uniform vec2 uStep;
  uniform float uFromAlpha;
  float take(vec2 uv) { vec4 c = texture2D(tMap, uv); return uFromAlpha > 0.5 ? c.a : c.r; }
  void main() {
    float sum = take(vUv) * 0.1964;
    sum += (take(vUv + uStep) + take(vUv - uStep)) * 0.1747;
    sum += (take(vUv + uStep * 2.0) + take(vUv - uStep * 2.0)) * 0.1210;
    sum += (take(vUv + uStep * 3.0) + take(vUv - uStep * 3.0)) * 0.0651;
    sum += (take(vUv + uStep * 4.0) + take(vUv - uStep * 4.0)) * 0.0273;
    gl_FragColor = vec4(sum / 0.9726, 0.0, 0.0, 1.0);
  }`);
const rimPass = screenPass({ tDice: { value: diceTarget.texture }, tBlur: { value: blurTargetB.texture }, uTexel: { value: new THREE.Vector2() }, uStrength: { value: 0 } }, `
  varying vec2 vUv;
  uniform sampler2D tDice, tBlur;
  uniform vec2 uTexel;
  uniform float uStrength;
  void main() {
    vec4 dice = texture2D(tDice, vUv);
    float blurred = texture2D(tBlur, vUv).r;   // 실루엣 바로 위에서 0.5, 안쪽 깊은 곳에서 1
    vec3 color = dice.a > 0.001 ? dice.rgb / dice.a : vec3(1.0);
    // 흐린 실루엣의 기울기로 외곽의 바깥 방향을 구해, 빛을 향하는 정도를 봅니다.
    vec2 slope = vec2(texture2D(tBlur, vUv + vec2(uTexel.x, 0.0)).r - texture2D(tBlur, vUv - vec2(uTexel.x, 0.0)).r,
                      texture2D(tBlur, vUv + vec2(0.0, uTexel.y)).r - texture2D(tBlur, vUv - vec2(0.0, uTexel.y)).r);
    float facing = dot(-slope / max(length(slope), 1e-5), normalize(vec2(${BACKLIGHT.light.join(', ')})));
    float lit = smoothstep(-0.12, 0.42, facing), shaded = smoothstep(0.04, 0.5, -facing);
    float rim = pow(1.0 - smoothstep(0.5, ${BACKLIGHT.rimReach.toFixed(3)}, blurred), 1.35) * ${BACKLIGHT.rimAmount.toFixed(3)} * lit;
    float shadow = pow(1.0 - smoothstep(0.5, ${BACKLIGHT.shadowReach.toFixed(3)}, blurred), 1.5) * ${BACKLIGHT.shadowAmount.toFixed(3)} * shaded;
    color = mix(color, vec3(1.0), rim * uStrength);
    color = mix(color, vec3(${BACKLIGHT.shadowInk.toFixed(3)}), shadow * uStrength);
    float soft = mix(${BACKLIGHT.rimSoft.toFixed(3)}, ${BACKLIGHT.shadowSoft.toFixed(3)}, shaded);
    float alpha = mix(dice.a, smoothstep(0.5 - soft, 0.5 + soft, blurred), uStrength);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= alpha;
  }`);
function drawScreenPass(material, target) {
  screenQuad.material = material;
  renderer.setRenderTarget(target);
  renderer.render(screenScene, screenCamera);
}
function renderWithBacklight(strength) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const blurWidth = Math.max(1, size.x >> 1), blurHeight = Math.max(1, size.y >> 1);
  if (diceTarget.width !== size.x || diceTarget.height !== size.y) {
    diceTarget.setSize(size.x, size.y);
    blurTargetA.setSize(blurWidth, blurHeight);
    blurTargetB.setSize(blurWidth, blurHeight);
  }
  renderer.setRenderTarget(diceTarget);
  renderer.render(scene, camera);
  const blur = Math.max(BACKLIGHT.minBlur, BACKLIGHT.blur * diceViewScale * diceDepthScale);
  const step = renderer.getPixelRatio() * blur / 1.6;   // 흐리기 한 칸의 길이(절반 해상도 픽셀)
  blurPass.uniforms.tMap.value = diceTarget.texture;
  blurPass.uniforms.uFromAlpha.value = 1;
  blurPass.uniforms.uStep.value.set(step / blurWidth, 0);
  drawScreenPass(blurPass, blurTargetA);
  blurPass.uniforms.tMap.value = blurTargetA.texture;
  blurPass.uniforms.uFromAlpha.value = 0;
  blurPass.uniforms.uStep.value.set(0, step / blurHeight);
  drawScreenPass(blurPass, blurTargetB);
  rimPass.uniforms.uStrength.value = strength;
  rimPass.uniforms.uTexel.value.set(Math.max(1, step / 2) / blurWidth, Math.max(1, step / 2) / blurHeight);
  drawScreenPass(rimPass, null);
}

function updateCamera() {
  const scale = diceViewScale;
  const shiftX = diceScreenShift[0] / scale, shiftY = (diceScreenShift[1] + 5) / scale;
  camera.left = -innerWidth / (2 * scale) - shiftX;
  camera.right = innerWidth / (2 * scale) - shiftX;
  camera.top = innerHeight / (2 * scale) + shiftY;
  camera.bottom = -innerHeight / (2 * scale) + shiftY;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function render() {
  if (!sceneDrawn) return;   // p5가 주사위 자리(띠 아래 가운데)를 정하기 전에는 그리지 않습니다.
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
  // 화면 크기에 맞춘 크기와, 기록 화면에서 왼쪽 아래로 옮겨 가는 이동을 p5와 똑같이 맞춥니다.
  // (Shop의 화면 경계 판정이 이번 프레임의 화면 크기를 쓰도록 updateShop보다 먼저 맞춥니다.)
  updateCamera();
  if (shopMode && !wasShop) { if (shopCatalog) startCatalog(); else startShop(); updateCamera(); }   // 시작 자리는 카메라를 맞춘 뒤에 계산합니다.
  updateShop();
  // 휴대폰에서 구석으로 내려간 작은 주사위는 스크롤되는 내용에 가려지지 않게 화면 위층에 그립니다.
  renderer.domElement.style.zIndex = innerWidth <= 600 && !lollingWorld && writingViewProgress > .5 ? '6' : '1';
  // Shop 재질로 바뀌는 순간부터 외곽 효과를 서서히 켭니다.
  const backlight = THREE.MathUtils.smoothstep(shopProgress, 0.5, 1);
  if (backlight > 0) renderWithBacklight(backlight); else renderer.render(scene, camera);
}

// ───────── Shop 화면: 손으로 만지는 실물 주사위 ─────────
// 이 주사위는 윗면 숫자가 1 → 6으로 커질수록 속의 조명이 밝아지는 조명 주사위입니다.
// - 주사위를 잡고 상하좌우로 밀면(또는 방향키) 그쪽으로 한 칸 넘어가며 윗면 숫자와 밝기가 바뀝니다.
// - 위로 힘껏 들어 올렸다가 놓으면 던져집니다(클릭·스페이스바로는 던지지 않음).
// - 바닥에 벽이 없습니다. 화면 밖으로 굴러 나가면 같은 줄의 반대쪽 화면 밖으로 이어져, 한 칸 굴러 다시 들어옵니다.
// - 뒤로 갈수록 원근감으로 조금(최대 12%) 작아지고, 앞(화면 아래)으로 다가올수록 더 크게(최대 30%) 커집니다.
// - 윗면 숫자마다 정해진 5가지 멈춤 각도 중 하나가 있고(같은 숫자는 늘 같은 각도), 넘어가는 동안 그 각도로 이어서 돌아갑니다.
const HALF = DICE_SIZE / 2;
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
let diceRadius = 0;   // 주사위 중심에서 가장 먼 표면까지(월드 단위, 원근 크기 1 기준)
let shownGlow = 0, lastFrame = performance.now();

const depthScale = z => z < 0 ? 1 + Math.max(z / (2 * DICE_SIZE), -1) * 0.12 : 1 + Math.min(z / DICE_SIZE, 3) * 0.1;
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const yawAround = angle => new THREE.Quaternion().setFromAxisAngle(UP_AXIS, angle);
const shopReady = () => shopMode && !shopCatalog && shopProgress === 1 && !throwState && !tipState && !writingOpen && window.glbDiceReady;

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
  startTip(Math.abs(w.x) > Math.abs(w.z) ? [Math.sign(w.x), 0] : [0, Math.sign(w.z)]);
}

// ── 화면 경계 판정: 모두 사용자가 보는 브라우저 화면의 2D 좌표(px)로 계산합니다 ──
// 주사위의 실제 렌더링 크기(원근감에 따른 depthScale 포함)를 그대로 써서 판정만 하고, 그리는 크기는 바꾸지 않습니다.
// 칸 좌표는 정수가 아니어도 됩니다(점대칭 위치에 정확히 놓기 위해).

const toScreen = v => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };

// 칸에 놓인 주사위 중심의 화면 좌표와 화면상의 한 변 길이
function cellScreen(cell) {
  const z = cell[1] * DICE_SIZE, scale = depthScale(z);
  const center = toScreen(new THREE.Vector3(cell[0] * DICE_SIZE, HALF * scale, z));
  return { x: center.x + roomMoveLeft(), y: center.y + roomMoveUp(), size: DICE_SIZE * diceViewScale * scale };
}
// 칸에 놓인 주사위가 화면에서 차지하는 사각형(정육면체 꼭짓점 8개를 투영)
function cellRect(cell) {
  const z = cell[1] * DICE_SIZE, scale = depthScale(z), half = HALF * scale;
  const rect = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const dx of [-1, 1]) for (const dy of [0, 2]) for (const dz of [-1, 1]) {
    const p = toScreen(new THREE.Vector3(cell[0] * DICE_SIZE + dx * half, dy * half, z + dz * half));
    const x = p.x + roomMoveLeft();
    rect.left = Math.min(rect.left, x); rect.right = Math.max(rect.right, x);
    const y = p.y + roomMoveUp();
    rect.top = Math.min(rect.top, y); rect.bottom = Math.max(rect.bottom, y);
  }
  return rect;
}
// 구매 패널이 넓게 열리면 주사위가 쓸 수 있는 공간의 오른쪽 끝이 패널 왼쪽 끝으로 바뀝니다.
// 휴대폰에서는 패널이 아래에서 올라오므로, 대신 주사위 공간의 아래쪽 끝이 패널 위쪽 끝으로 바뀝니다.
const isPhone = () => innerWidth <= 600;
const phoneSheetOpen = () => !!shopWideCell && isPhone();
const roomRight = () => shopWideCell && !isPhone() ? innerWidth - shopPanelRuler.offsetWidth : innerWidth;
const roomBottom = () => phoneSheetOpen() ? innerHeight - shopPanel.offsetHeight : innerHeight;
// 바닥이 아직 옮겨 가는 중이어도 판정은 도착한 뒤의 화면 기준으로 합니다.
const roomMoveLeft = () => shopRoomGoal - shopRoomShift;
const roomMoveUp = () => shopRoomGoalY - shopRoomShiftY;
// 주사위가 멈춰 쉬는 영역: 화면에서 위쪽 Memo 버튼과 아래쪽 안내 문구 자리를 뺀 곳(매 프레임 실제 위치로 갱신).
// 휴대폰처럼 화면이 작을 때 주사위가 버튼·안내 밑에 멈춰 잡기 어려워지지 않게 합니다. 화면 밖 판정과 점대칭 계산은 화면 전체 기준 그대로입니다.
let playTop = 0, playBottom = 0;
function updatePlayArea() {
  const memo = document.getElementById('memoButton'), hint = document.querySelector('.shop-hint');
  const memoRect = memo && memo.offsetParent ? memo.getBoundingClientRect() : null;
  const hintRect = hint && hint.offsetParent ? hint.getBoundingClientRect() : null;
  playTop = Math.max(memoRect ? memoRect.bottom + 8 : 0, topBandHeight + 8);
  playBottom = hintRect && hintRect.height ? innerHeight - hintRect.top + 8 : 0;
}
// 쉬는 영역 테두리까지의 여유(px). 음수면 그만큼 밖으로 삐져나감
function sideGaps(cell) {
  const r = cellRect(cell);
  const floor = phoneSheetOpen() ? roomBottom() : innerHeight - playBottom;   // 패널이 올라와 있으면 안내 문구는 감춰져 있습니다.
  return { left: r.left, right: roomRight() - r.right, top: r.top - playTop, bottom: floor - r.bottom };
}
const NEAR_EDGE = 0.4;      // 테두리까지 여유가 주사위 한 변의 0.4배보다 작으면 '가장자리'(잡기 어려운 자리)
const INSIDE_PAD = 8;       // 복귀가 끝났을 때 테두리에서 최소한 떨어져 있을 거리(px)
function cellOffscreen(cell) {
  const r = cellRect(cell);
  return r.right < 0 || r.left > roomRight() || r.bottom < topBandHeight || r.top > roomBottom();
}
const cellFullyInside = cell => Object.values(sideGaps(cell)).every(gap => gap >= INSIDE_PAD);
const minGap = cell => Math.min(...Object.values(sideGaps(cell)));
function nearSide(cell, side) { return sideGaps(cell)[side] < NEAR_EDGE * cellScreen(cell).size; }
const cellNearEdge = cell => ['left', 'right', 'top', 'bottom'].some(side => nearSide(cell, side));

// 이 방향으로 굴러가면 가까이 있는 테두리 쪽으로 다가가는지
function headingToNearEdge(cell, dir) {
  const p = cellScreen(cell), q = cellScreen([cell[0] + dir[0], cell[1] + dir[1]]);
  const dx = q.x - p.x, dy = q.y - p.y;
  return (nearSide(cell, 'left') && dx < 0) || (nearSide(cell, 'right') && dx > 0)
    || (nearSide(cell, 'top') && dy < 0) || (nearSide(cell, 'bottom') && dy > 0);
}

// 화면 좌표(px)에 주사위 중심이 보이도록 하는 칸 좌표(바닥 위, 원근 크기까지 맞춰 몇 번 되풀이해 수렴)
function cellAtScreen(x, y) {
  const ndc = [(x - roomMoveLeft()) / innerWidth * 2 - 1, 1 - (y - roomMoveUp()) / innerHeight * 2];
  let scale = 1, hit = null;
  for (let i = 0; i < 4; i++) {
    const near = new THREE.Vector3(ndc[0], ndc[1], -1).unproject(camera);
    const far = new THREE.Vector3(ndc[0], ndc[1], 1).unproject(camera);
    hit = near.lerp(far, (HALF * scale - near.y) / (far.y - near.y));
    scale = depthScale(hit.z);
  }
  return [hit.x / DICE_SIZE, hit.z / DICE_SIZE];
}
// 주사위 공간의 중심에 대한 점대칭 위치: (x, y) → (W − x, H − y). W는 구매 패널이 넓게 열리면 남은 공간의 폭입니다.
const mirrorCell = cell => { const p = cellScreen(cell); return cellAtScreen(roomRight() - p.x, roomBottom() + topBandHeight - p.y); };

// 복귀할 때 들어오며 몇 칸 굴러야 하는지 정합니다.
// ① 모든 테두리에서 가장자리 범위(잡기 어려운 자리) 밖인 첫 칸 → ② 없으면 주사위 전체가 화면 안인 첫 칸
// → ③ 그것도 없으면 가장 안쪽에 들어오는 칸.
function entrySteps(cell, dir) {
  let inside = 0, best = 1, bestGap = -Infinity;
  for (let i = 1; i <= 40; i++) {
    const at = [cell[0] + dir[0] * i, cell[1] + dir[1] * i];
    if (cellFullyInside(at)) {
      if (!cellNearEdge(at)) return i;
      if (!inside) inside = i;
    } else if (inside) break;   // 화면 안을 지나 다시 밖으로 나가는 구간은 보지 않음
    const gap = minGap(at);
    if (gap > bestGap) { bestGap = gap; best = i; }
  }
  return inside || best;
}

// mode: 'leaving'(가장자리에서 저절로 화면 밖으로), 'entering'(반대쪽에서 저절로 들어오는 중), 없으면 손으로 넘김
function startTip(dir, bump = false, mode = null, remaining = 0) {
  const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
  const from = rootQuaternion.multiply(faceQuaternion);
  // 넘어간 뒤 위로 올 숫자를 미리 구해, 넘어가는 동안 그 숫자의 멈춤 각도로 서서히 돌아가게 합니다.
  const axis = UP_AXIS.clone().cross(new THREE.Vector3(dir[0], 0, dir[1]));
  const landed = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(from);
  const yawTo = bump ? shopYaw : REST_YAWS[(currentTopFace(landed) - 1) % REST_YAWS.length];
  tipState = { start: performance.now(), dir, bump, mode, remaining, yawFrom: shopYaw, yawTo, from };
  if (!mode && !bump) applyManualTip(tipState);
}

// 복귀가 끝나면 조작 상태를 모두 정리해, 보이는 자리에서 바로 다시 잡거나 굴릴 수 있게 합니다.
function finishEntering() {
  tipState = null; drag = null; heldLift = 0;
  document.body.style.cursor = '';
}

// 창 크기가 바뀌어 멈춰 있던 주사위가 화면 밖이나 테두리에 걸리게 되면, 화면 중심 쪽으로 가장 가까운 '다 보이는' 자리로 옮깁니다.
let lastShopSize = '';
function keepInsideAfterResize() {
  const size = innerWidth + 'x' + innerHeight;
  if (size === lastShopSize) return;
  lastShopSize = size;
  if (shopCatalog || tipState || throwState || drag || cellFullyInside(shopCell)) return;
  // 테두리 가장자리 범위까지 벗어난 자리를 먼저 찾고, 없으면 전체가 보이는 첫 자리로 옮깁니다.
  const center = cellAtScreen(roomRight() / 2, (roomBottom() + topBandHeight) / 2);
  let firstInside = null;
  for (let i = 1; i <= 40; i++) {
    const t = i / 40, at = [shopCell[0] + (center[0] - shopCell[0]) * t, shopCell[1] + (center[1] - shopCell[1]) * t];
    if (!cellFullyInside(at)) continue;
    if (!cellNearEdge(at)) { shopCell = at; return; }
    firstInside = firstInside || at;
  }
  shopCell = firstInside || center;
}

// 구매 패널: 주사위가 처음 자리(가운데 칸)보다 왼쪽 칸에 있으면 열리고, 가운데 칸이나 그 오른쪽이면 닫힙니다.
// 넘어가기 시작할 때 도착할 칸을 기준으로 정하므로, 주사위가 움직이는 동시에 패널도 움직입니다.
const shopPanel = document.getElementById('shopPanel');
const shopPanelRuler = document.querySelector('.shop-panel-ruler');   // CSS에 적힌 넓은 패널 폭을 그대로 읽습니다.
let shopPanelStage = 0;   // 0 닫힘, 1 열림, 2 넓게 열림
let shopWideCell = null;  // 넓게 열린 동안 주사위 공간의 가운데에 올 칸
const shopPhotos = [...document.querySelectorAll('.shop-panel-gallery img')];
const shopGallery = document.querySelector('.shop-panel-gallery');
// 위아래로 한 칸 굴릴 때 사진을 어디서 어디로 옮길지 정합니다(step: 아래 +1 다음 사진, 위 -1 이전 사진). 처음과 끝 사진에서는 더 넘어가지 않습니다.
function photoScrollFor(step) {
  const pad = parseFloat(getComputedStyle(shopGallery).paddingTop);
  const stops = shopPhotos.map(photo => photo.offsetTop - pad);
  const from = shopGallery.scrollTop;
  const nearest = stops.reduce((best, stop, i) => Math.abs(stop - from) < Math.abs(stops[best] - from) ? i : best, 0);
  return { from, to: stops[THREE.MathUtils.clamp(nearest + step, 0, stops.length - 1)] };
}
function setShopPanel(stage) {
  if (stage === shopPanelStage) return;
  shopPanelStage = stage;
  document.body.classList.toggle('shop-panel-open', stage > 0);
  document.body.classList.toggle('shop-panel-wide', stage === 2);
  shopPanel.inert = stage === 0;
  shopPanel.setAttribute('aria-hidden', String(stage === 0));
}
// 왼쪽으로 두 칸째 굴리면 넓게 열리고, 넓게 열린 동안 오른쪽으로 굴리면 다시 좁아집니다.
// 좁은 공간의 가장자리를 넘어 저절로 되돌아오는 동안에는 넓게 열린 상태를 그대로 둡니다.
// 판정은 손으로 굴리기 시작하는 순간에 합니다(프레임이 밀려 굴림이 한 프레임에 끝나도 놓치지 않게).
function applyManualTip(tip) {
  const [dx, dz] = tip.dir, column = shopCell[0] + dx;
  document.body.classList.remove('shop-at-start');
  // 휴대폰: 위로 굴리면 패널이 아래에서 올라옵니다. 올라온 동안은 패널 위쪽 공간 안에서 자유롭게 굴리고,
  // 그 공간의 아래쪽 끝에서 한 번 더 아래로 굴릴 때만 패널이 내려갑니다(좌우로 굴려도 그대로).
  if (isPhone()) {
    const next = [shopCell[0] + dx, shopCell[1] + dz];
    if (shopWideCell && dz > 0 && sideGaps(next).bottom < NEAR_EDGE * cellScreen(next).size) { shopWideCell = null; tip.opensWide = true; }
    else if (!shopWideCell && dz < 0) { shopWideCell = [shopCell[0], shopCell[1] + dz]; tip.opensWide = true; }
    return;
  }
  if (shopWideCell && dx > 0) shopWideCell = null;
  else if (!shopWideCell && dx < 0 && column < -1.25) { shopWideCell = [column, shopCell[1]]; tip.opensWide = true; }
  // 넓게 열린 동안(데스크톱) 위아래로 굴리면 사진도 같은 타이밍으로 넘어갑니다.
  if (shopWideCell && dz && innerWidth > 600) tip.photoScroll = photoScrollFor(dz);
}
// Shop에 들어올 때(데스크톱): 구매 패널을 넓게 연 상태에서, 윗면 1인 주사위가 좁아진 공간의 가운데에서 시작합니다.
// 패널이 열리는 동안 주사위는 화면 가운데에서 그 자리로 미끄러져 갑니다.
const SHOP_START_COLUMN = -2;
const shopStartHint = document.querySelector('.shop-start-hint');
let throwingHome = false;
// Shop에서 던지면(데스크톱) 주사위가 시작 자리로 날아가 윗면 1로 떨어지고, 패널과 사진도 시작 상태로 돌아갑니다.
function throwShopDice() {
  if (innerWidth <= 600) { rollDice(); return; }
  rollDice(1);
  if (!throwState) return;
  setActiveFace(null);
  throwState.toStart = true;
  throwState.endX = SHOP_START_COLUMN * DICE_SIZE;
  throwState.endZ = 0;
  shopCell = [SHOP_START_COLUMN, 0];
  shopWideCell = shopCell.slice();
  shopGallery.scrollTo({ top: 0, behavior: 'smooth' });
  throwingHome = true;
  document.body.classList.remove('shop-at-start');
}
// restart: Shop 안에서 로고를 눌러 돌아올 때. 주사위는 지금 화면 자리에서 시작 자리로 미끄러져 가고, 배경 밝기와 사진도 부드럽게 돌아갑니다.
// keepFace: 제품 목록에서 넘어올 때. 목록에서 굴러간 윗면을 그대로 이어 갑니다.
function startShop(restart = false, keepFace = false) {
  if (innerWidth <= 600) return;
  const fromX = restart && diceScreenCenter ? diceScreenCenter[0] : innerWidth / 2;
  if (throwState) { throwState = null; currentRoll = null; lift = 0; }
  if (!keepFace) {
    diceRotation = landingRotation(1);
    faceQuaternion = topFaceQuaternion(diceRotation);
    shopYaw = REST_YAWS[0];
  }
  if (!restart) { shownGlow = 0; diceGlowLevel = 0; }
  shopCell = [SHOP_START_COLUMN, 0];
  shopWideCell = shopCell.slice();
  shopGallery.scrollTo({ top: 0, behavior: restart ? 'smooth' : 'auto' });
  throwingHome = false;
  document.body.classList.add('shop-at-start');
  shopRoomGoal = roomRight() / 2 - (cellScreen(shopWideCell).x - shopRoomGoal);
  shopRoomShift = fromX - roomRight() / 2 + shopRoomGoal;
  diceScreenShift[0] = shopRoomShift;
  lastShopSize = innerWidth + 'x' + innerHeight;
}
// 띠 가운데 로고: Shop 화면에서는 Shop 시작 상태로 돌아갑니다(Memo 화면은 이미 시작 화면입니다).
// 데스크톱에서는 제품 상세 화면에서 누르면 제품 목록으로 돌아갑니다.
document.getElementById('homeLogo').addEventListener('click', () => {
  if (!shopMode || !wasShop || shopCatalog) return;
  tipState = null; drag = null; heldLift = 0;
  document.body.style.cursor = '';
  if (isPhone()) startShop(true); else openCatalog();
});

// ───────── Shop 제품 목록(데스크톱) ─────────
// 람페 칸의 사진 영역은 뚫려 있어, 그 뒤로 Shop의 주사위와 바닥이 칸 크기로 줄어 보입니다.
// 칸에 마우스를 올리면 주사위가 제자리에서 한 번 굴러 다음 윗면으로 넘어가고(배경도 그 숫자의 빛으로 바뀜), 벗어나면 되돌아 굴러옵니다.
const catalogWindow = document.querySelector('.catalog-window');
const catalogLampe = document.getElementById('catalogLampe');
let catalogHover = false, catalogRolled = false;
function startCatalog() {
  if (throwState) { throwState = null; currentRoll = null; lift = 0; }
  diceRotation = landingRotation(1);
  faceQuaternion = topFaceQuaternion(diceRotation);
  shownGlow = 0; diceGlowLevel = 0;
  shopYaw = REST_YAWS[0];
  shopCell = [0, 0]; shopWideCell = null; tipState = null; drag = null; heldLift = 0;
  catalogRolled = false;
  throwingHome = false;
  document.body.classList.remove('shop-at-start');
  shopGallery.scrollTo({ top: 0 });
  lastShopSize = innerWidth + 'x' + innerHeight;
}
// 제품 상세 화면에서 목록으로: 주사위는 지금 화면 자리에서 람페 칸으로 미끄러져 갑니다.
function openCatalog() {
  const from = diceScreenCenter ? diceScreenCenter.slice() : null;
  setShopCatalog(true);
  startCatalog();
  if (!from) return;
  const p = cellScreen(shopCell);
  const shiftY = shopRoomGoalY + from[1] - p.y;
  shopRoomShift = shopRoomGoal + from[0] - p.x;
  diceScreenShift[0] = shopRoomShift; diceScreenShift[1] += shiftY - shopRoomShiftY;
  shopRoomShiftY = shiftY;
}
// 목록에서 람페 칸을 누르면 제품 상세 화면으로 넘어갑니다.
function openDetail() {
  if (!shopCatalog) return;
  catalogHover = false;
  if (tipState?.mode === 'inPlace') {   // 굴러가는 중이면 그 윗면으로 바로 내려놓습니다.
    const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
    const axis = UP_AXIS.clone().cross(new THREE.Vector3(tipState.dir[0], 0, tipState.dir[1]));
    faceQuaternion = rootQuaternion.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(tipState.from));
    shopYaw = tipState.yawTo;
    tipState = null;
  }
  setShopCatalog(false);
  startShop(true, true);
}
catalogLampe.addEventListener('pointerenter', () => { catalogHover = true; });
catalogLampe.addEventListener('pointerleave', () => { catalogHover = false; });
catalogLampe.addEventListener('focus', () => { catalogHover = true; });
catalogLampe.addEventListener('blur', () => { catalogHover = false; });
catalogLampe.addEventListener('click', event => { event.preventDefault(); openDetail(); });
function updateCatalog() {
  if (isPhone()) { setShopCatalog(false); startShop(); return; }
  setShopPanel(0);
  // 주사위가 람페 칸 사진 영역의 가운데에 오도록 바닥과 주사위를 함께 옮깁니다.
  const r = catalogWindow.getBoundingClientRect();
  if (r.width) {
    const p = cellScreen(shopCell);
    shopRoomGoal = r.left + r.width / 2 - (p.x - shopRoomGoal);
    shopRoomGoalY = r.top + r.height / 2 - (p.y - shopRoomGoalY);
  }
  if (!tipState && !throwState && window.glbDiceReady && shopProgress === 1 && catalogHover !== catalogRolled) {
    catalogRolled = catalogHover;
    startTip(catalogHover ? [1, 0] : [-1, 0], false, 'inPlace');
  }
}
function updateShopPanel() {
  if (shopCatalog) { updateCatalog(); return; }
  const column = shopCell[0] + (tipState ? tipState.dir[0] : 0);
  if (throwingHome && !throwState) { throwingHome = false; document.body.classList.add('shop-at-start'); }
  if (shopWideCell) shopStartHint.style.left = `${roomRight() / 2}px`;
  setShopPanel(shopWideCell ? 2 : !isPhone() && column < -0.25 ? 1 : 0);
  // 패널 뒤로 비치는 방이 밝으면 글자를 검정으로 바꿉니다(문턱값을 둘로 나눠 경계에서 깜빡이지 않게 합니다).
  if (shopPanelStage > 0) document.body.classList.toggle('shop-panel-light', shopPanelBack > (document.body.classList.contains('shop-panel-light') ? 0.5 : 0.58));
  // 넓게 열리면 그 칸이 남은 공간의 가운데에 오도록 바닥과 주사위를 함께 옮깁니다.
  shopRoomGoal = shopWideCell ? roomRight() / 2 - (cellScreen(shopWideCell).x - shopRoomGoal) : 0;
  // 휴대폰에서 패널이 올라오면 그 칸이 패널 위쪽 공간의 가운데에 오도록 바닥과 주사위를 위로 옮깁니다.
  shopRoomGoalY = phoneSheetOpen() ? (topBandHeight + roomBottom()) / 2 - (cellScreen(shopWideCell).y - shopRoomGoalY) : 0;
}

function updateShop() {
  const now = performance.now(), dt = Math.min(now - lastFrame, 100);
  lastFrame = now;
  if (!shopMode) {
    // 시작 화면으로 돌아가면 가운데 칸, 원래 크기로 되돌립니다.
    if (wasShop) {
      shopWideCell = null; shopRoomGoal = 0; shopRoomGoalY = 0; throwingHome = false; catalogHover = false; catalogRolled = false;
      document.body.classList.remove('shop-at-start');
      setShopPanel(0);
      wasShop = false; shopCell = [0, 0]; tipState = null; drag = null; heldLift = 0; shopYaw = 0;
      if (!throwState) { positionX = 0; positionZ = 0; lift = 0; }
      diceScreenCenter = null;
      diceDepthScale = 1;
    }
    stage.position.set(0, 0, 0);
    stage.scale.setScalar(1);
    return;
  }
  wasShop = true;
  updatePlayArea();
  keepInsideAfterResize();
  const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
  const center = new THREE.Vector3(shopCell[0] * DICE_SIZE, HALF, shopCell[1] * DICE_SIZE);
  if (throwState?.toStart) center.set(positionX, HALF, positionZ);   // 시작 자리로 날아가는 동안에는 던지기 궤적을 따라갑니다.
  let scale = depthScale(center.z);
  if (tipState) {
    // 바닥에 닿은 앞쪽 모서리를 축으로 90° 넘어갑니다(벽에 막히면 살짝 들렸다 돌아옴).
    const t = Math.min(1, (now - tipState.start) / (tipState.bump ? BUMP_TIME : TIP_TIME));
    const eased = tipState.bump ? Math.sin(Math.PI * t) * 0.32 : (1 - Math.cos(Math.PI * t)) / 2 * Math.PI / 2;
    const d = new THREE.Vector3(tipState.dir[0], 0, tipState.dir[1]);
    const axis = new THREE.Vector3(0, 1, 0).cross(d);
    const pivot = center.clone().add(d.clone().multiplyScalar(HALF)).setY(0);
    center.sub(pivot).applyAxisAngle(axis, eased).add(pivot);
    if (tipState.mode === 'inPlace') { center.x = shopCell[0] * DICE_SIZE; center.z = shopCell[1] * DICE_SIZE; }   // 제자리에서 굴러 높이만 바뀝니다.
    scale = depthScale(center.z);
    // 넘어가는 동안 멈춤 각도도 이전 숫자의 각도에서 다음 숫자의 각도로 이어서 돌아갑니다(벽에 막혀 들썩일 때는 그대로).
    const progress = (1 - Math.cos(Math.PI * t)) / 2;
    if (tipState.photoScroll) shopGallery.scrollTop = tipState.photoScroll.from + (tipState.photoScroll.to - tipState.photoScroll.from) * progress;
    const yaw = tipState.yawFrom + (tipState.yawTo - tipState.yawFrom) * progress;
    const turned = yawAround(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(axis, eased)).multiply(tipState.from);
    dice.quaternion.copy(rootQuaternion.clone().invert().multiply(turned));
    if (t === 1) {
      if (!tipState.bump) {
        if (tipState.mode !== 'inPlace') shopCell = [shopCell[0] + tipState.dir[0], shopCell[1] + tipState.dir[1]];
        faceQuaternion = rootQuaternion.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(tipState.from));
      }
      // 면이 바닥에 닿는 순간 '탁'
      playTipImpact(tipState.bump ? 0.5 : 1);
      shopYaw = tipState.yawTo;
      dice.quaternion.copy(rootQuaternion.clone().invert().multiply(yawAround(shopYaw)).multiply(rootQuaternion).multiply(faceQuaternion));
      const finished = tipState;
      tipState = null;
      // 1) 손으로 테두리 쪽으로 넘겨 가장자리(잡기 어려운 자리)에 닿으면, 같은 방향으로 저절로 굴러 나갑니다.
      // 2) 나가는 중에는 주사위도, 화면 중심 점대칭 자리의 주사위도 모두 화면 밖일 때까지 굴러갑니다.
      //    그다음 점대칭 자리 (W − x, H − y)로 옮겨, 같은 방향으로 굴러 들어옵니다(나간 쪽이 앞이면 크게, 들어오는 쪽이 뒤면 작게 보이는 것이 정상).
      // 3) 들어오는 중에는 미리 정한 칸 수만큼만 굴러, 주사위 전체가 화면 안에 들어온 자리에서 멈춥니다.
      //    이 자리에서는 다시 나가기 판정을 하지 않습니다(사용자가 또 테두리 쪽으로 밀 때만).
      if (!finished.bump && finished.mode !== 'inPlace') {
        if (finished.mode === 'entering') {
          if (finished.remaining > 1) startTip(finished.dir, false, 'entering', finished.remaining - 1);
          else finishEntering();
        } else if (finished.mode === 'leaving') {
          if (cellOffscreen(shopCell) && cellOffscreen(mirrorCell(shopCell))) {
            shopCell = mirrorCell(shopCell);
            startTip(finished.dir, false, 'entering', entrySteps(shopCell, finished.dir));
          } else {
            startTip(finished.dir, false, 'leaving');
          }
        } else if (!finished.opensWide && cellNearEdge(shopCell) && headingToNearEdge(shopCell, finished.dir)) {   // 넓게 열리며 도착한 칸에서는 멈춥니다(휴대폰은 공간이 좁아 늘 가장자리입니다).
          startTip(finished.dir, false, 'leaving');
        }
      }
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
  // 주사위가 화면 밖으로 완전히 나가 있는 동안에도 마지막으로 보였을 때의 밝기·배경을 그대로 두고,
  // 조금이라도 다시 보이기 시작하면 그때의 윗면 숫자로 이어서 바뀝니다(주사위 렌더링 방식은 그대로).
  // 주사위를 감싸는 공의 화면 원이 화면과 한 점이라도 겹치면 '보임'으로 봅니다(직교 카메라라 원 그대로 투영됨).
  const centerPx = toScreen(new THREE.Vector3(center.x, center.y + heldLift, center.z));
  const radiusPx = diceRadius * scale * diceViewScale;
  // 배경 빛 웅덩이(sketch.js)의 중심: 화면에 보이는 주사위 중심
  diceScreenCenter = [centerPx.x, centerPx.y];
  const nearestX = Math.min(Math.max(centerPx.x, 0), innerWidth), nearestY = Math.min(Math.max(centerPx.y, topBandHeight), innerHeight);
  const diceVisible = Math.hypot(centerPx.x - nearestX, centerPx.y - nearestY) < radiusPx;
  if (!throwState && diceVisible) shownGlow += ((currentTopFace() - 1) / 5 - shownGlow) * (1 - Math.exp(-dt / 380));
  // 윗면 1의 밝기(emissiveIntensity 1, 속 광원 2.2)에서 시작해 6으로 갈수록 훨씬 밝아집니다.
  // 배경은 단계 그대로(diceGlowLevel), 주사위 밝기는 윗면 3~6에서 같은 만큼(0.1단계) 낮춰 씁니다.
  // 2(0.2)와 3(0.4) 사이에서 서서히 내려가므로, 3 이상도 늘 2보다는 밝습니다(3 → 0.3, 6 → 0.9).
  const diceLevel = shownGlow - DICE_DIM_ABOVE_TWO * THREE.MathUtils.smoothstep(shownGlow, 0.2, 0.4);
  GLOW_LEVEL.value = diceLevel;
  diceGlowLevel = shownGlow;
  // 바깥 조명(위·왼쪽 앞에서 비추는 빛)은 단계와 상관없이 그대로 두어, 윗면·왼쪽 앞면은 늘 밝고 오른쪽 옆면만 그늘을 받습니다.
  // 단계가 오르면 속의 빛만 더해져 주사위가 점점 밝아집니다.
  // 6에서도 숫자 눈이 하얗게 묻히지 않도록, 패널 빛은 1의 1.5배까지만 오릅니다(눈은 따로 더 밝아짐).
  ACRYLIC.emissiveIntensity = 1 + 0.5 * diceLevel;
  // 윗면 1(조명 꺼짐): 미색 아이보리 패널과 새틴 금속(덜 반짝이는 은은한 광)으로 보입니다. 2 이상으로 가면 부드럽게 원래대로.
  const off = 1 - THREE.MathUtils.smoothstep(shownGlow, 0, 0.2);
  updateShopPanel();
  OFF_LOOK.value = off;
  FROST_MILK.value = OFF_FROST.milk; FROST_RIM.value = OFF_FROST.rim; FROST_SEE.value = OFF_FROST.seeThrough;
  // 뒤가 비치려면 투명 재질이어야 합니다(비침이 있을 때만 켬).
  const wantTransparent = OFF_FROST.seeThrough * off > 0.001;
  if (ACRYLIC.transparent !== wantTransparent) { ACRYLIC.transparent = wantTransparent; ACRYLIC.needsUpdate = true; }
  for (const material of steelMaterials) {
    material.roughness = THREE.MathUtils.lerp(0.45, OFF_STEEL_ROUGHNESS, off);
    material.envMapIntensity = THREE.MathUtils.lerp(1.6, OFF_STEEL_SHINE, off);
  }
  if (shopProgress > .5) innerLight.intensity = (2.2 + 3 * diceLevel) * (1 - 0.6 * off);
}

const raycaster = new THREE.Raycaster(), pointerNdc = new THREE.Vector2();
function hitsDice(event) {
  pointerNdc.set(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  if (raycaster.intersectObjects(toonMeshes, false).length > 0) return true;
  // 손가락은 마우스보다 굵으므로, 터치일 때는 주사위 둘레 24px까지 잡은 것으로 봅니다.
  if (event.pointerType !== 'touch') return false;
  const r = cellRect(shopCell), pad = 24;
  return event.clientX > r.left - pad && event.clientX < r.right + pad && event.clientY > r.top - pad && event.clientY < r.bottom + pad;
}
addEventListener('pointerdown', event => {
  // iOS 등은 손으로 만진 순간에만 소리를 켤 수 있어, Shop에서 첫 터치 때 오디오를 깨워 둡니다.
  if (shopMode && typeof ensureDiceAudio === 'function') { ensureDiceAudio(); diceAudio?.resume?.().catch(() => {}); }
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
    if (heldLift > THROW_LIFT) { throwLift = heldLift; heldLift = 0; throwShopDice(); }
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

load().catch(error => console.warn('3D 주사위를 불러오지 못했어요.', error));
