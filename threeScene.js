import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;
let sceneCanvas = null;
let paddle = null;
let ball = null;
let isInitialized = false;
let hasPaddlePose = false;
let paddleHitCooldown = 0;
let paddleScreenRotationZ = 0;

const paddleVelocity = new THREE.Vector3();
const lastPaddlePosition = new THREE.Vector3();
const ballVelocity = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const faceCenterWorld = new THREE.Vector3();
const collisionNormal = new THREE.Vector3();

const CAMERA_Z = 5;
const BALL_Z = -2.4;
const BALL_RADIUS = 0.12;
const BALL_GRAVITY = -7.5;
const MAX_FALL_SPEED = 8.5;
const PADDLE_FACE_RADIUS = 1.22;
const PADDLE_FACE_THICKNESS = 0.05;
const PADDLE_FACE_CENTER_Y = 1.48;
/** Gameplay hit uses slightly larger radius than the visible mesh for forgiving contact. */
const PADDLE_HIT_RADIUS_MULT = 1.12;
const HANDLE_RADIUS = 0.18;
const HANDLE_LENGTH = 1.75;
const HANDLE_CENTER_Y = -0.4;
const SIDE_PADDING_RATIO = 0.18;
const TOP_SPAWN_OFFSET = 0.6;
const MIN_BALL_SPEED = 2.6;
const MAX_BALL_SPEED = 5.8;
const MIN_UPWARD_SPEED = 4.4;

const randomRange = (min, max) => min + Math.random() * (max - min);

const clampBallSpeed = () => {
  const speed = ballVelocity.length();
  if (speed < 0.001) {
    ballVelocity.set(0.8, -MIN_BALL_SPEED, 0);
    return;
  }

  if (speed < MIN_BALL_SPEED) {
    ballVelocity.setLength(MIN_BALL_SPEED);
  } else if (speed > MAX_BALL_SPEED) {
    ballVelocity.setLength(MAX_BALL_SPEED);
  }
};

const getVisibleWorldSize = (z = BALL_Z) => {
  if (!camera) {
    return { width: 0, height: 0 };
  }

  const distance = Math.max(0.1, camera.position.z - z);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const height = 2 * Math.tan(verticalFov / 2) * distance;

  return {
    width: height * camera.aspect,
    height,
  };
};

const createPaddle = () => {
  paddle = new THREE.Group();

  const faceGeometry = new THREE.CylinderGeometry(
    PADDLE_FACE_RADIUS,
    PADDLE_FACE_RADIUS,
    PADDLE_FACE_THICKNESS,
    48
  );
  faceGeometry.rotateX(Math.PI / 2);

  const faceMaterial = new THREE.MeshStandardMaterial({
    color: 0xd63c32,
    metalness: 0.15,
    roughness: 0.7,
  });
  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  face.position.y = PADDLE_FACE_CENTER_Y;
  paddle.add(face);

  const handleGeometry = new THREE.CylinderGeometry(
    HANDLE_RADIUS,
    HANDLE_RADIUS * 1.05,
    HANDLE_LENGTH,
    24
  );
  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0xc48a54,
    metalness: 0.05,
    roughness: 0.92,
  });
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.position.y = HANDLE_CENTER_Y;
  paddle.add(handle);

  const neckGeometry = new THREE.CylinderGeometry(0.28, 0.34, 0.34, 20);
  neckGeometry.rotateX(Math.PI / 2);
  const neck = new THREE.Mesh(neckGeometry, handleMaterial);
  neck.position.y = 0.22;
  paddle.add(neck);

  paddle.visible = false;
  scene.add(paddle);
};

const createBall = () => {
  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
  const material = new THREE.MeshStandardMaterial({
    color: 0xf7f7f2,
    emissive: 0x1a1a1a,
    metalness: 0.05,
    roughness: 0.35,
  });

  ball = new THREE.Mesh(geometry, material);
  scene.add(ball);
};

const resetBall = () => {
  if (!ball) return;

  const { width, height } = getVisibleWorldSize(BALL_Z);
  const minX = -width / 2 + width * SIDE_PADDING_RATIO;
  const maxX = width / 2 - width * SIDE_PADDING_RATIO;

  ball.position.set(randomRange(minX, maxX), height / 2 + TOP_SPAWN_OFFSET, BALL_Z);
  ballVelocity.set(
    randomRange(0.8, 1.8) * (Math.random() < 0.5 ? -1 : 1),
    -randomRange(2.4, 3.6),
    0
  );
};

const updatePaddle = (
  paddlePosition,
  paddleRotation,
  paddleVisible,
  deltaTime,
  gameplayRotationZ = null
) => {
  if (!paddle) return;

  paddle.visible = paddleVisible;

  if (!paddleVisible || !paddlePosition) {
    hasPaddlePose = false;
    paddleVelocity.set(0, 0, 0);
    return;
  }

  tempVector.set(paddlePosition.x, paddlePosition.y, paddlePosition.z);

  if (!hasPaddlePose || deltaTime <= 0) {
    paddleVelocity.set(0, 0, 0);
    hasPaddlePose = true;
  } else {
    paddleVelocity.copy(tempVector).sub(lastPaddlePosition).multiplyScalar(1 / deltaTime);
  }

  paddle.position.copy(tempVector);
  lastPaddlePosition.copy(tempVector);

  if (paddleRotation) {
    paddle.rotation.set(paddleRotation.x || 0, paddleRotation.y || 0, paddleRotation.z || 0);
    paddleScreenRotationZ =
      gameplayRotationZ != null && Number.isFinite(gameplayRotationZ)
        ? gameplayRotationZ
        : paddleRotation.z || 0;
  }

  paddle.position.z = BALL_Z;
  paddle.updateMatrixWorld(true);
};

const updateGameplayFaceCenter = () => {
  faceCenterWorld.set(
    paddle.position.x - Math.sin(paddleScreenRotationZ) * PADDLE_FACE_CENTER_Y,
    paddle.position.y + Math.cos(paddleScreenRotationZ) * PADDLE_FACE_CENTER_Y,
    BALL_Z
  );
};

const handleBallWallCollisions = () => {
  if (!ball) return;

  const { width, height } = getVisibleWorldSize(ball.position.z);
  const halfWidth = width / 2 - BALL_RADIUS;
  const halfHeight = height / 2 - BALL_RADIUS;

  if (ball.position.x < -halfWidth) {
    ball.position.x = -halfWidth;
    ballVelocity.x = Math.abs(ballVelocity.x);
  } else if (ball.position.x > halfWidth) {
    ball.position.x = halfWidth;
    ballVelocity.x = -Math.abs(ballVelocity.x);
  }

  if (ball.position.y > halfHeight) {
    ball.position.y = halfHeight;
    ballVelocity.y = -Math.abs(ballVelocity.y);
  }

  if (ball.position.y < -height / 2 - BALL_RADIUS * 2) {
    resetBall();
  }
};

const handlePaddleCollision = () => {
  if (!ball || !paddle || !paddle.visible || paddleHitCooldown > 0) {
    return;
  }

  updateGameplayFaceCenter();

  collisionNormal.set(
    ball.position.x - faceCenterWorld.x,
    ball.position.y - faceCenterWorld.y,
    0
  );

  const collisionDistance = collisionNormal.length();
  const overlapDistance = PADDLE_FACE_RADIUS * PADDLE_HIT_RADIUS_MULT + BALL_RADIUS;
  if (collisionDistance > overlapDistance) {
    return;
  }

  if (collisionDistance < 0.001) {
    collisionNormal.set(0, 1, 0);
  } else {
    collisionNormal.multiplyScalar(1 / collisionDistance);
  }

  const horizontalInfluence =
    collisionNormal.x * 2.2 + paddleVelocity.x * 0.08 + paddleVelocity.y * 0.02;
  const verticalLift =
    MIN_UPWARD_SPEED +
    Math.max(0, paddleVelocity.y) * 0.12 +
    Math.max(0, -collisionNormal.y) * 1.25;

  ballVelocity.x = THREE.MathUtils.clamp(
    ballVelocity.x * 0.35 + horizontalInfluence,
    -MAX_BALL_SPEED,
    MAX_BALL_SPEED
  );
  ballVelocity.y = Math.max(verticalLift, Math.abs(ballVelocity.y) * 0.2);
  ballVelocity.z = 0;
  clampBallSpeed();

  ball.position.copy(faceCenterWorld).addScaledVector(collisionNormal, overlapDistance + 0.02);
  ball.position.z = BALL_Z;
  paddleHitCooldown = 0.08;
};

const updateBall = (deltaTime) => {
  if (!ball || deltaTime <= 0) return;

  if (paddleHitCooldown > 0) {
    paddleHitCooldown = Math.max(0, paddleHitCooldown - deltaTime);
  }

  ballVelocity.y = Math.max(-MAX_FALL_SPEED, ballVelocity.y + BALL_GRAVITY * deltaTime);
  ball.position.addScaledVector(ballVelocity, deltaTime);
  ball.position.z = BALL_Z;
  handlePaddleCollision();
  handleBallWallCollisions();
};

/**
 * Initializes the Three.js scene for table tennis.
 * @param {HTMLCanvasElement} canvas - The canvas element for rendering.
 * @param {HTMLVideoElement} video - The video element used for aspect ratio.
 */
export const initThreeScene = (canvas, video) => {
  if (isInitialized) return;

  sceneCanvas = canvas;
  scene = new THREE.Scene();

  const aspect = video.videoWidth / video.videoHeight;
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
  camera.position.z = CAMERA_Z;

  renderer = new THREE.WebGLRenderer({
    canvas: sceneCanvas,
    alpha: true,
    antialias: true,
  });

  renderer.setPixelRatio(window.devicePixelRatio);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(3, 4, 8);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x8cc8ff, 0.5);
  rimLight.position.set(-4, -2, 6);
  scene.add(rimLight);

  createPaddle();
  createBall();
  handleResize();
  resetBall();

  isInitialized = true;
  render();
};

/**
 * Advances the table tennis scene by one frame.
 * @param {Object} params - Frame update params.
 * @param {{x:number,y:number,z:number}|null} params.paddlePosition - Paddle position.
 * @param {{x:number,y:number,z:number}|null} params.paddleRotation - Paddle rotation.
 * @param {boolean} params.paddleVisible - Whether the paddle is visible.
 * @param {number} params.deltaTime - Frame delta time in seconds.
 */
export const updateTableTennis = ({
  paddlePosition = null,
  paddleRotation = null,
  /** Screen-space Z used only for gameplay face offset; can differ from visual paddle.rotation.z */
  gameplayRotationZ = null,
  paddleVisible = false,
  deltaTime = 0,
} = {}) => {
  if (!isInitialized) return;

  updatePaddle(paddlePosition, paddleRotation, paddleVisible, deltaTime, gameplayRotationZ);
  updateBall(deltaTime);
  render();
};

/**
 * Gets the current ball state for debug output.
 * @returns {{position: {x:number,y:number,z:number}, velocity: {x:number,y:number,z:number}}|null}
 */
export const getBallState = () => {
  if (!ball) return null;

  return {
    position: {
      x: ball.position.x,
      y: ball.position.y,
      z: ball.position.z,
    },
    velocity: {
      x: ballVelocity.x,
      y: ballVelocity.y,
      z: ballVelocity.z,
    },
  };
};

/**
 * Renders the scene.
 */
export const render = () => {
  if (!isInitialized || !renderer || !scene || !camera) return;
  renderer.render(scene, camera);
};

/**
 * Updates the renderer size to match the current viewport.
 * @param {number} width - The source video width.
 * @param {number} height - The source video height.
 */
export const updateSize = (width, height) => {
  if (!renderer || !camera || !sceneCanvas) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  handleResize();
};

/**
 * Handles browser resize updates.
 */
const handleResize = () => {
  if (!renderer || !camera || !sceneCanvas) return;

  const displayWidth = window.innerWidth;
  const displayHeight = window.innerHeight;

  sceneCanvas.width = displayWidth;
  sceneCanvas.height = displayHeight;
  renderer.setSize(displayWidth, displayHeight, false);
};

if (typeof window !== "undefined") {
  window.addEventListener("resize", handleResize);
}

/**
 * Checks if the scene is initialized.
 * @returns {boolean}
 */
export const getIsInitialized = () => isInitialized;

