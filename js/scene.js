// scene.js — the 3D part: a dark room, the desk with its two lit green lamps,
// the closed book standing on its spine, and the intro camera move.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SepiaShader } from 'three/addons/shaders/SepiaShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

// I - Settings (all distances are in metres)
const LAMP_COLOR = 0xf2c47a;                           // very warm orange light from the flames
const SHADE_COLOR = 0x5cff6a;                          // green glass of the lamp shades
const BOOK_POSITION = new THREE.Vector3(-0.1, 0.78, 0.16); // on the desk top, in front
const BOOK_SIZE = 0.3;                                  // height of a page
const BOOK_SCALE = BOOK_SIZE / 2.59;                    // 2.59 = page height inside the model file
const BOOK_OPEN = { from: 0.85, to: 1.7 };              // seconds of the book animation where it opens
const INTRO_SECONDS = 6;
const START_VIEW = { position: new THREE.Vector3(-0.1, 1.45, 1.9), target: new THREE.Vector3(-0.1, 0.9, 0) }; // straight in front of the book

// II - Renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#scene'), antialias: true });
renderer.setPixelRatio(1);                              // light while moving (the final view is drawn sharper, see VII)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;                     // overall brightness

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0705);
scene.fog = new THREE.Fog(0x0a0705, 3, 8);              // the far room fades into darkness

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);

// III - Filters (each pass is applied to the image, one after the other)
// (samples: 2 = light anti-aliasing, so edges stay smooth instead of pixelated)
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(), 0.4, 0.5, 1)); // glow of the lamp shades
composer.addPass(new OutputPass());
// Medieval vintage filter: old-paper colours + softly darker corners.
const sepia = new ShaderPass(SepiaShader);
sepia.uniforms.amount.value = 0.2;
const vignette = new ShaderPass(VignetteShader);
vignette.uniforms.darkness.value = 0.9;
composer.addPass(sepia);
composer.addPass(vignette);

// IV - Room lights
// A soft warm light everywhere, so nothing is pitch black.
scene.add(new THREE.HemisphereLight(0xffd9a8, 0x3a2a1c, 1.2));

// A light coming from behind the camera, so what we look at is always well lit and readable.
const cameraLight = new THREE.DirectionalLight(0xfff0dc, 1.8);
cameraLight.position.set(0, 0.5, 1);   // slightly above and behind the camera...
cameraLight.target.position.set(0, 0, -1);   // ...shining where the camera looks
camera.add(cameraLight, cameraLight.target);
scene.add(camera);

// A floor to catch the lamp light.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x2a1d14 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// V - Models
const loader = new GLTFLoader().setDRACOLoader(
  new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/')
);
let mixer;   // plays the book opening animation

export async function loadScene() {
  const [desk, book] = await Promise.all([loader.loadAsync('desk.glb'), loader.loadAsync('book.glb')]);
  setUpDesk(desk.scene);
  setUpBook(book);
  scene.add(desk.scene, book.scene);
  await renderer.compileAsync(scene, camera);          // prepare everything now, so the page doesn't freeze later
  needsRender = true;
}

function setUpDesk(desk) {
  desk.getObjectByName('Open_book').visible = false;   // our own book takes its place
  desk.getObjectByName('Magnifier').visible = false;   // it was lying on that open book

  // The double lamp: one warm light between the two flames, and a faint green glow above the shades.
  // (each light costs a lot, so 2 lights for the whole lamp instead of 4)
  const lamp = desk.getObjectByName('Lamp_Lamp_0');
  desk.updateMatrixWorld(true);
  const flames = new THREE.PointLight(LAMP_COLOR, 2);
  flames.position.copy(lamp.localToWorld(new THREE.Vector3(0, 0, 0.36)));
  const shadeGlow = new THREE.PointLight(SHADE_COLOR, 0.3);
  shadeGlow.position.copy(lamp.localToWorld(new THREE.Vector3(0, 0, 0.5)));
  scene.add(flames, shadeGlow);
}

function setUpBook(book) {
  book.scene.traverse((object) => {
    object.frustumCulled = false;                      // animated meshes can be wrongly hidden otherwise
  });
  book.scene.getObjectByName('Book_0').material.map.anisotropy = 8; // sharper texture when seen at an angle
  book.scene.scale.setScalar(BOOK_SCALE);
  book.scene.position.copy(BOOK_POSITION);

  mixer = new THREE.AnimationMixer(book.scene);
  mixer.clipAction(book.animations[0]).play();
  mixer.setTime(BOOK_OPEN.from);                       // closed, standing on its spine
}

// VI - Intro: zoom into the desk while the book opens
let progress = 0;   // 0 = start view, 1 = facing the open book
let intro = null;   // { start, done } while the intro is playing

export function playIntro() {
  return new Promise((done) => { intro = { start: performance.now(), done }; });
}

// Where the camera must be to see the whole open book, with a small margin around it (seen from above).
function bookView() {
  const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const width = 3.88 * BOOK_SCALE, height = BOOK_SIZE;   // 3.88 = open book width inside the model file
  const margin = 1.03;                                   // 1 = book touches the window edges, bigger = more space around it
  const distance = margin * Math.max(height / 2 / halfFov, width / 2 / halfFov / camera.aspect);
  const target = BOOK_POSITION.clone().setY(BOOK_POSITION.y + 0.03);
  return { position: target.clone().setY(target.y + distance), target };
}

function updateCamera() {
  const start = START_VIEW, end = bookView();
  const move = THREE.MathUtils.smootherstep(progress, 0, 1);        // slow start, slow end

  // Position: a curve, like a face coming closer: first forward over the desk, then leaning down onto the book.
  const bend = new THREE.Vector3(end.position.x, start.position.y, end.position.z + 0.4);
  new THREE.QuadraticBezierCurve3(start.position, bend, end.position).getPoint(move, camera.position);

  // Rotation: the camera keeps looking at the book, and the top of the screen turns slowly
  // from "the sky" to "the far side of the desk", at the same pace as the movement.
  // So turning and zooming feel like one motion, with no sudden spin at the end.
  camera.up.lerpVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), move).normalize();
  camera.lookAt(new THREE.Vector3().lerpVectors(start.target, end.target, move));

  const open = THREE.MathUtils.smootherstep(progress, 0.3, 0.8);    // the book opens during the zoom
  mixer?.setTime(BOOK_OPEN.from + open * (BOOK_OPEN.to - BOOK_OPEN.from));
}

// VII - Render loop
// We only draw a new image when something changed (models loaded, intro playing, window resized).
// The rest of the time the computer rests.
let needsRender = true;

renderer.setAnimationLoop((now) => {
  if (intro) {
    progress = Math.min((now - intro.start) / 1000 / INTRO_SECONDS, 1);
    if (progress === 1) {
      intro.done();
      intro = null;
      composer.setPixelRatio(Math.min(devicePixelRatio, 2));   // the book stays still now: draw it sharp, once
    }
    needsRender = true;
  }
  if (!needsRender) return;
  updateCamera();
  composer.render();
  needsRender = false;
});

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  needsRender = true;
}
addEventListener('resize', resize);
resize();
