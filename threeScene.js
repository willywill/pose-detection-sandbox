import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;
let cylinder = null;
let isInitialized = false;

/**
 * Initializes the Three.js scene with a cylinder
 * @param {HTMLCanvasElement} canvas - The canvas element for rendering
 * @param {HTMLVideoElement} video - The video element for background texture
 */
export const initThreeScene = (canvas, video) => {
  if (isInitialized) return;

  // Scene setup
  scene = new THREE.Scene();

  // Camera setup - perspective camera matching video aspect ratio
  const aspect = video.videoWidth / video.videoHeight;
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
  camera.position.z = 5;

  // Renderer setup
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true, // Transparent background for overlay
    antialias: true,
  });
  
  // Set canvas element width/height attributes to match display size
  // The canvas CSS makes it full viewport (100vw x 100vh)
  const displayWidth = window.innerWidth;
  const displayHeight = window.innerHeight;
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  
  // Set renderer size to match canvas display size
  renderer.setSize(displayWidth, displayHeight, false);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  // Create cylinder (table tennis paddle-like shape) - bigger size
  const geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4a90e2,
    metalness: 0.3,
    roughness: 0.4,
  });
  cylinder = new THREE.Mesh(geometry, material);
  
  // Position cylinder initially in center at typical hand depth
  cylinder.position.set(0, 0, -2.5);
  scene.add(cylinder);

  isInitialized = true;
};

/**
 * Updates the cylinder position
 * @param {number} x - X coordinate in 3D space
 * @param {number} y - Y coordinate in 3D space
 * @param {number} z - Z coordinate in 3D space
 */
export const setCylinderPosition = (x, y, z) => {
  if (!cylinder) return;
  cylinder.position.set(x, y, z);
};

/**
 * Resets the cylinder to center position
 */
export const resetCylinderPosition = () => {
  if (!cylinder) return;
  cylinder.position.set(0, 0, -2.5);
  cylinder.rotation.set(0, 0, 0);
};

/**
 * Updates the cylinder rotation
 * @param {number} x - Rotation around X axis (pitch) in radians
 * @param {number} y - Rotation around Y axis (yaw) in radians
 * @param {number} z - Rotation around Z axis (roll) in radians
 */
export const setCylinderRotation = (x, y, z) => {
  if (!cylinder) return;
  cylinder.rotation.set(x, y, z);
};

/**
 * Sets the visibility of the cylinder
 * @param {boolean} visible - Whether the cylinder should be visible
 */
export const setCylinderVisibility = (visible) => {
  if (!cylinder) return;
  cylinder.visible = visible;
};

/**
 * Gets the current cylinder position
 * @returns {THREE.Vector3|null} The cylinder position
 */
export const getCylinderPosition = () => {
  if (!cylinder) return null;
  return cylinder.position.clone();
};

/**
 * Renders the scene
 */
export const render = () => {
  if (!isInitialized || !renderer || !scene || !camera) return;
  renderer.render(scene, camera);
};

/**
 * Updates the renderer size to match canvas display dimensions
 * @param {number} width - New width (video pixel width, for aspect calculation)
 * @param {number} height - New height (video pixel height, for aspect calculation)
 */
export const updateSize = (width, height) => {
  if (!renderer || !camera || !canvas) return;
  
  // Update camera aspect ratio based on video dimensions
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  // Update renderer size to match canvas display size (full viewport)
  handleResize();
};

/**
 * Handles window resize to update renderer size
 */
const handleResize = () => {
  if (!renderer || !camera || !canvas) return;
  
  const displayWidth = window.innerWidth;
  const displayHeight = window.innerHeight;
  
  // Update canvas element attributes
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  
  // Update renderer size
  renderer.setSize(displayWidth, displayHeight, false);
};

// Add window resize listener
if (typeof window !== 'undefined') {
  window.addEventListener('resize', handleResize);
}

/**
 * Checks if the scene is initialized
 * @returns {boolean} True if initialized
 */
export const getIsInitialized = () => isInitialized;

