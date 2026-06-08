import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import gsap from 'gsap';

// Import postprocessing classes
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';

const HDR_URL =
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/shanghai_bund_2k.hdr';
let model = null;

// MORE SMALL TEXX, BRO!
const smallTextsData = [
  {
    text: "Night City",
    fontSize: 0.045,
    position: { x: -0.41, y: -0.38, z: 1.1 },
    color: '#0033ff',
    // opacity: 0.28,
    rotation: 0.1
  },
  // ... (rest unchanged)
  {
    text: "S.K.E.L.E.T.O.N",
    fontSize: 0.500,
    position: { x: -0.07, y: -0.09, z: 1.2 },
    color: '#09eaff',
    opacity: 0.02,
    rotation: 0.03
  }
];

function makeSmallTextSprite(text, fontSize, color, opacity = 0.3, rotation = 0) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  // Canvas must be high-res for text clarity
  const width = 420, height = 100;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.globalAlpha = opacity;
  context.font = `bold ${Math.round(fontSize * 100)}px 'Orbitron', 'Segoe UI', Arial, sans-serif`;
  context.fillStyle = color;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.shadowColor = color;
  context.shadowBlur = 24;
  context.fillText(text, width/2, height/2);

  const tex = new THREE.Texture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    // opacity: opacity,
    depthWrite: false,
    depthTest: false
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(fontSize * 7.3, fontSize, 1); // approximate for cyberpunk aesthetic
  spr.rotation = rotation;
  return spr;
}

let smallTexts = [];
function addSmallTexts(overBox) {
  // Remove old ones first
  smallTexts.forEach(txt => scene.remove(txt));
  smallTexts = [];
  if (!overBox) return;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  overBox.getCenter(center);
  overBox.getSize(size);

  for (let entry of smallTextsData) {
    const s = makeSmallTextSprite(entry.text, entry.fontSize * size.y, entry.color, entry.opacity, entry.rotation);
    s.position.set(center.x + entry.position.x * size.y, center.y + entry.position.y * size.y, center.z + entry.position.z * size.z);
    s.renderOrder = 15;
    scene.add(s);
    smallTexts.push(s);
  }
}

// Add more small texts after model is in the right place
function initializeSceneAfterModelLoad() {
  if (!model) return;
  addSmallTexts(new THREE.Box3().setFromObject(model));
}

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 4;

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#canvas'),
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const hdrLoader = new HDRLoader();
hdrLoader.load(
  HDR_URL,
  (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;

    scene.environment = envMap;
    scene.background = null;

    texture.dispose();
    pmremGenerator.dispose();
  },
  undefined,
  (error) => console.error('Failed to load HDRI world', error)
);

const gltfLoader = new GLTFLoader();
gltfLoader.load(
  '/DamagedHelmet.gltf',
  (gltf) => {
    model = gltf.scene;
    model.scale.set(0.85, 0.85, 0.85); // Don't change model size!
    model.position.set(0, -0.1, 0);
    scene.add(model);
    initializeSceneAfterModelLoad();
  },
  undefined,
  (error) => console.error('Failed to load GLTF model', error)
);

// --- Postprocessing: RGB Shift setup ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Copy and customize the RGBShiftShader to shift toward blue
const CustomRGBShiftShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "amount":   { value: 0.003 },
    "angle":    { value: Math.PI / 2 },
    "blueOffset": { value: 0.002 }
  },
  vertexShader: RGBShiftShader.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float angle;
    uniform float blueOffset;
    varying vec2 vUv;

    void main() {
      vec2 offset = amount * vec2(cos(angle), sin(angle));
      vec4 cr = texture2D(tDiffuse, vUv + offset);
      vec4 cga = texture2D(tDiffuse, vUv);
      vec4 cb = texture2D(tDiffuse, vUv - offset + vec2(0.0, blueOffset));
      gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);
    }
  `
};

const rgbShiftPass = new ShaderPass(CustomRGBShiftShader);
rgbShiftPass.enabled = true;
rgbShiftPass.uniforms['amount'].value = 0.003;
rgbShiftPass.uniforms['blueOffset'].value = 0.002;
composer.addPass(rgbShiftPass);
// ---------------------------------------

// Mouse hover effect - use gsap for smooth in/out animation and rotation
const canvas = document.querySelector('#canvas');
let isHoveringCanvas = false;
let pointerX = 0.5, pointerY = 0.5; // normalized, for smooth animation

// We'll store rotation targets on a gsap object for smooth animation
const rotationState = {
  x: 0,
  y: 0
};

if (canvas) {
  canvas.addEventListener('mouseenter', () => {
    isHoveringCanvas = true;
    // Use gsap to smoothly "ease in" to interactive state if you want (optional)
    if (model) {
      gsap.to(rotationState, {
        duration: 0.5,
        x: model.rotation.x,
        y: model.rotation.y,
        overwrite: 'auto',
        ease: "power2.out"
      });
    }
  });

  canvas.addEventListener('mouseleave', () => {
    isHoveringCanvas = false;
    // Use gsap to smoothly animate back model to neutral pose
    if (model) {
      gsap.to(rotationState, {
        duration: 0.8,
        x: 0,
        y: 0,
        overwrite: 'auto',
        ease: "power2.out"
      });
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!model) return;
    // Get mouse coords relative to canvas
    const rect = canvas.getBoundingClientRect();
    pointerX = (e.clientX - rect.left) / rect.width;
    pointerY = (e.clientY - rect.top) / rect.height;

    // Calculate desired target rotations from pointer coords
    const targetRotX = (pointerY - 0.5) * Math.PI * 0.3; // around X
    const targetRotY = (pointerX - 0.5) * Math.PI * 0.3; // around Y

    // Animate rotationState smoothly with gsap (not the model directly)
    gsap.to(rotationState, {
      duration: 0.4,
      x: targetRotX,
      y: targetRotY,
      overwrite: "auto",
      ease: "power2.out"
    });
  });
}

function animate() {
  requestAnimationFrame(animate);

  if (model) {
    // On hover, always lerp model's rotation toward gsap-animated rotationState
    model.rotation.x += (rotationState.x - model.rotation.x) * 0.1;
    model.rotation.y += (rotationState.y - model.rotation.y) * 0.1;
  }

  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

animate();