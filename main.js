import {
  setDebug,
  dist,
  handTo3D,
  landmarkTo3D,
  expSmoothVec3,
  clampVec3Delta,
  expSmoothAngle,
} from "./utils.js";
import { startWebcam } from "./camera.js";
import { drawHand, triggerConfetti } from "./renderer.js";
import {
  initHandLandmarker,
  getHandLandmarker,
  parseHandLandmarkerResult,
  isFist,
  getFistOrientation,
  isPeace,
  isThumbsUp,
  handsClose,
  getFistRotation,
} from "./handDetection.js";
import {
  initThreeScene,
  updateTableTennis,
  updateSize as update3DSize,
  getIsInitialized,
  getBallState,
} from "./threeScene.js";

const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const canvas3D = document.getElementById("canvas-3d");
const debugEl = document.getElementById("debug");
const debugContentEl = document.getElementById("debug-content");
const debugToggleCheckbox = document.getElementById("debug-toggle-checkbox");
const selectionScreen = document.getElementById("selection-screen");
const experimentButtonsContainer = document.getElementById("experiment-buttons");
const ctx = canvas.getContext("2d");

let lastDetections = null;
let currentExperimentId = null;
let lastFrameTime = performance.now();

/** Raw landmark rows (for fist bump, debug overlay) */
let activeTableTennisHand = null;
let activeTableTennisHandIndex = -1;

/** Full per-hand packet from MediaPipe (landmarks + world + handedness) */
let activeTableTennisPacket = null;
let lastStableTableTennisPacket = null;

const tableTennisFsm = {
  lockedHandedness: null,
  dropoutFrames: 0,
};

const tableTennisSmooth = {
  grip: null,
  rx: null,
  ry: null,
  rzVisual: null,
  rzGameplay: null,
};

const TABLE_TENNIS_PLAY_Z = -2.4;
const TT_MIN_HANDEDNESS_SCORE = 0.52;
const TT_LOCK_RELEASE_FRAMES = 56;
const TT_DROPOUT_HIDE_FRAMES = 15;
const TT_MAX_GRIP_JUMP = 0.48;
const TT_SMOOTH_GRIP = 0.34;
const TT_SMOOTH_ROT_XY = 0.3;
const TT_SMOOTH_ROT_Z_VISUAL = 0.38;
const TT_SMOOTH_ROT_Z_GAMEPLAY = 0.55;

// Array of available experiments
const experiments = [
  { name: "Fist Bump", id: "fist-bump" },
  { name: "Table Tennis", id: "table-tennis" },
];

const packetSizeScore = (packet) => {
  const h = packet.landmarks;
  return dist(h[0], h[9]) + dist(h[5], h[17]) + (packet.handednessScore || 0) * 0.06;
};

const updateTableTennisHandSelection = (packets) => {
  if (!packets || packets.length === 0) {
    tableTennisFsm.dropoutFrames += 1;
    if (tableTennisFsm.dropoutFrames > TT_LOCK_RELEASE_FRAMES) {
      tableTennisFsm.lockedHandedness = null;
    }
    activeTableTennisPacket = null;
    activeTableTennisHand = null;
    activeTableTennisHandIndex = -1;
    return;
  }

  tableTennisFsm.dropoutFrames = 0;

  let pool = packets.filter(
    (p) =>
      (p.handednessScore >= TT_MIN_HANDEDNESS_SCORE && p.handedness) ||
      !p.handedness ||
      p.handednessScore >= TT_MIN_HANDEDNESS_SCORE - 0.08
  );
  if (!pool.length) pool = packets;

  if (tableTennisFsm.lockedHandedness) {
    const same = pool.filter((p) => p.handedness === tableTennisFsm.lockedHandedness);
    if (same.length) pool = same;
  }

  let best = pool[0];
  let bestScore = packetSizeScore(best);
  for (let i = 1; i < pool.length; i++) {
    const s = packetSizeScore(pool[i]);
    if (s > bestScore) {
      best = pool[i];
      bestScore = s;
    }
  }

  if (!tableTennisFsm.lockedHandedness && best.handedness) {
    tableTennisFsm.lockedHandedness = best.handedness;
  }

  activeTableTennisPacket = best;
  lastStableTableTennisPacket = best;
  activeTableTennisHand = best.landmarks;
  activeTableTennisHandIndex = best.index;
};

const resetTableTennisTracking = () => {
  activeTableTennisHand = null;
  activeTableTennisHandIndex = -1;
  activeTableTennisPacket = null;
  lastStableTableTennisPacket = null;
  tableTennisFsm.lockedHandedness = null;
  tableTennisFsm.dropoutFrames = 0;
  tableTennisSmooth.grip = null;
  tableTennisSmooth.rx = null;
  tableTennisSmooth.ry = null;
  tableTennisSmooth.rzVisual = null;
  tableTennisSmooth.rzGameplay = null;
};

/**
 * Palm-centered grip in image space, projected to gameplay plane; handedness biases thumb side.
 */
const getTableTennisPaddleAnchor = (hand, handedness) => {
  const w = hand[0];
  const i = hand[5];
  const m = hand[9];
  const p = hand[17];
  const cx = (w.x + i.x + m.x + p.x) / 4;
  const cy = (w.y + i.y + m.y + p.y) / 4;
  const gx = w.x * 0.38 + cx * 0.62;
  const gy = w.y * 0.38 + cy * 0.62;
  const base = { x: gx, y: gy, z: w.z ?? 0 };

  let pos = landmarkTo3D(base, canvas.width, canvas.height, TABLE_TENNIS_PLAY_Z);

  const thumbSign =
    handedness === "Right" ? 1 : handedness === "Left" ? -1 : 0;
  if (thumbSign !== 0) {
    const ux = m.x - w.x;
    const uy = m.y - w.y;
    const len = Math.hypot(ux, uy) || 1;
    const px = -uy / len;
    const py = ux / len;
    const t = 0.026 * thumbSign;
    pos = landmarkTo3D(
      { x: gx + px * t, y: gy + py * t, z: base.z },
      canvas.width,
      canvas.height,
      TABLE_TENNIS_PLAY_Z
    );
  }

  return pos;
};

/**
 * Visual tilt from world palm normal + screen-plane yaw from wrist–middle axis.
 * `gameplayZ` is the yaw-only angle used for forgiving 2D collision offset.
 */
const getTableTennisPaddleRotation = (hand, world, handedness) => {
  const wrist = hand[0];
  const indexKnuckle = hand[5];
  const middleKnuckle = hand[9];
  const pinkyKnuckle = hand[17];
  const forwardX = middleKnuckle.x - wrist.x;
  const forwardY = wrist.y - middleKnuckle.y;
  const planeZ = Math.atan2(forwardY, forwardX) - Math.PI / 2;

  let pitch = 0;
  let yaw = 0;

  if (world && world.length >= 21) {
    const P = (idx) => world[idx];
    const ux = P(9).x - P(0).x;
    const uy = P(9).y - P(0).y;
    const uz = P(9).z - P(0).z;
    const vx = P(17).x - P(5).x;
    const vy = P(17).y - P(5).y;
    const vz = P(17).z - P(5).z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nlen = Math.hypot(nx, ny, nz);
    if (nlen > 1e-5) {
      nx /= nlen;
      ny /= nlen;
      nz /= nlen;
      const flip = handedness === "Left" ? -1 : 1;
      nx *= flip;
      ny *= flip;
      nz *= flip;
      pitch = -Math.asin(Math.max(-1, Math.min(1, ny))) * 0.92;
      yaw = Math.atan2(nx, nz) * 0.58;
    }
  }

  const fistRotation = getFistRotation(hand);
  const palmTiltX = ((indexKnuckle.z || 0) + (pinkyKnuckle.z || 0)) * 2.4;
  const palmTiltY = ((pinkyKnuckle.z || 0) - (indexKnuckle.z || 0)) * -2.9;

  const x = Math.max(
    -1.15,
    Math.min(1.15, pitch * 0.72 + (-fistRotation.x * 0.42 + palmTiltX * 0.35 + 0.12))
  );
  const y = Math.max(
    -1.35,
    Math.min(1.35, yaw * 0.72 + (-fistRotation.y * 0.35 + palmTiltY * 0.35))
  );

  return {
    x,
    y,
    z: planeZ,
    gameplayZ: planeZ,
  };
};

const smoothTableTennisPose = (rawPos, rawRot) => {
  let pos = rawPos;
  if (tableTennisSmooth.grip) {
    pos = clampVec3Delta(tableTennisSmooth.grip, rawPos, TT_MAX_GRIP_JUMP);
  }
  tableTennisSmooth.grip = expSmoothVec3(tableTennisSmooth.grip, pos, TT_SMOOTH_GRIP);

  tableTennisSmooth.rx =
    tableTennisSmooth.rx == null
      ? rawRot.x
      : tableTennisSmooth.rx + (rawRot.x - tableTennisSmooth.rx) * TT_SMOOTH_ROT_XY;
  tableTennisSmooth.ry =
    tableTennisSmooth.ry == null
      ? rawRot.y
      : tableTennisSmooth.ry + (rawRot.y - tableTennisSmooth.ry) * TT_SMOOTH_ROT_XY;

  tableTennisSmooth.rzVisual = expSmoothAngle(
    tableTennisSmooth.rzVisual,
    rawRot.z,
    TT_SMOOTH_ROT_Z_VISUAL
  );
  tableTennisSmooth.rzGameplay = expSmoothAngle(
    tableTennisSmooth.rzGameplay,
    rawRot.gameplayZ,
    TT_SMOOTH_ROT_Z_GAMEPLAY
  );

  return {
    position: tableTennisSmooth.grip,
    rotation: {
      x: tableTennisSmooth.rx,
      y: tableTennisSmooth.ry,
      z: tableTennisSmooth.rzVisual,
    },
    gameplayRotationZ: tableTennisSmooth.rzGameplay,
  };
};

/**
 * Generates debug info for the Fist Bump experiment
 * @param {Array} lastDetections - Array of hand landmark detections
 * @returns {Object} Debug info object
 */
const getFistBumpDebug = (lastDetections) => {
  let debug = {
    hands: lastDetections.length,
    distance: "-",
    handA_fist: "-",
    handB_fist: "-",
    handA_orient: "-",
    handB_orient: "-",
    facing: "-",
    close: "-",
    handA_peace: "-",
    handB_peace: "-",
    handA_thumb: "-",
    handB_thumb: "-",
  };

  if (lastDetections.length === 2) {
    const [A, B] = lastDetections;

    debug.distance = dist(A[0], B[0]).toFixed(3);

    const fistA = isFist(A);
    const fistB = isFist(B);
    const orientA = getFistOrientation(A);
    const orientB = getFistOrientation(B);
    const peaceA = isPeace(A);
    const peaceB = isPeace(B);
    const thumbA = isThumbsUp(A);
    const thumbB = isThumbsUp(B);

    const facingEachOther =
      (orientA === "left" && orientB === "right") ||
      (orientA === "right" && orientB === "left");
    const close = handsClose(A, B);

    debug.handA_fist = fistA;
    debug.handB_fist = fistB;
    debug.handA_orient = orientA;
    debug.handB_orient = orientB;
    debug.facing = facingEachOther;
    debug.close = close;
    debug.handA_peace = peaceA;
    debug.handB_peace = peaceB;
    debug.handA_thumb = thumbA;
    debug.handB_thumb = thumbB;

    if (fistA && fistB && facingEachOther && close) {
      const midX = (A[0].x + B[0].x) / 2;
      const midY = (A[0].y + B[0].y) / 2;
      triggerConfetti(midX, midY, "FIST BUMP!");
    }
  }

  return debug;
};

/**
 * Generates debug info for the Table Tennis experiment
 * @param {Array} lastDetections - Array of hand landmark detections
 * @returns {Object} Debug info object
 */
const getTableTennisDebug = (lastDetections) => {
  let debug = {
    hands: lastDetections.length,
    distance: "-",
    handA_fist: "-",
    handB_fist: "-",
    handA_orient: "-",
    handB_orient: "-",
    facing: "-",
    close: "-",
    handA_peace: "-",
    handB_peace: "-",
    handA_thumb: "-",
    handB_thumb: "-",
    handA_pos3D: "-",
    handB_pos3D: "-",
    handA_rotation: "-",
    handB_rotation: "-",
    tracked_hand:
      activeTableTennisHandIndex >= 0 ? activeTableTennisHandIndex + 1 : "-",
    tt_lock: tableTennisFsm.lockedHandedness ?? "-",
    tt_dropout: tableTennisFsm.dropoutFrames,
    tt_world: lastStableTableTennisPacket?.worldLandmarks ? "yes" : "no",
    ball_position: "-",
    ball_velocity: "-",
  };

  const handsForDebug =
    activeTableTennisHand && lastDetections.length > 1
      ? [
          activeTableTennisHand,
          ...lastDetections.filter((_, index) => index !== activeTableTennisHandIndex),
        ]
      : lastDetections;

  if (handsForDebug.length > 0) {
    const handA = handsForDebug[0];
    const handA3D = handTo3D(handA, canvas.width, canvas.height);
    const handAFist = isFist(handA);
    const handARotation = getFistRotation(handA);

    debug.handA_fist = handAFist;
    debug.handA_pos3D = `(${handA3D.x.toFixed(2)}, ${handA3D.y.toFixed(2)}, ${handA3D.z.toFixed(2)})`;

    if (handARotation) {
      debug.handA_rotation = `P:${(handARotation.x * 180 / Math.PI).toFixed(1)}° Y:${(handARotation.y * 180 / Math.PI).toFixed(1)}° R:${(handARotation.z * 180 / Math.PI).toFixed(1)}°`;
    }

    if (handsForDebug.length > 1) {
      const handB = handsForDebug[1];
      const handB3D = handTo3D(handB, canvas.width, canvas.height);
      const handBFist = isFist(handB);
      const handBRotation = getFistRotation(handB);

      debug.handB_fist = handBFist;
      debug.handB_pos3D = `(${handB3D.x.toFixed(2)}, ${handB3D.y.toFixed(2)}, ${handB3D.z.toFixed(2)})`;

      if (handBRotation) {
        debug.handB_rotation = `P:${(handBRotation.x * 180 / Math.PI).toFixed(1)}° Y:${(handBRotation.y * 180 / Math.PI).toFixed(1)}° R:${(handBRotation.z * 180 / Math.PI).toFixed(1)}°`;
      }
    }
  }

  const ballState = getBallState();
  if (ballState) {
    debug.ball_position = `(${ballState.position.x.toFixed(2)}, ${ballState.position.y.toFixed(2)}, ${ballState.position.z.toFixed(2)})`;
    debug.ball_velocity = `(${ballState.velocity.x.toFixed(2)}, ${ballState.velocity.y.toFixed(2)}, ${ballState.velocity.z.toFixed(2)})`;
  }

  return debug;
};

/**
 * Gets the appropriate debug generator function for the current experiment
 * @param {string} experimentId - The current experiment ID
 * @returns {Function} Debug generator function
 */
const getDebugGenerator = (experimentId) => {
  switch (experimentId) {
    case "fist-bump":
      return getFistBumpDebug;
    case "table-tennis":
      return getTableTennisDebug;
    default:
      return getTableTennisDebug; // Default to basic debug
  }
};

/**
 * Main render loop for hand detection and gesture recognition
 * Detects hands, analyzes gestures, and triggers effects
 */
const renderLoop = () => {
  const now = performance.now();
  const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const handLandmarker = getHandLandmarker();
  const results = handLandmarker.detectForVideo(video, now);
  lastDetections = results.landmarks || [];

  if (currentExperimentId === "table-tennis") {
    const packets = parseHandLandmarkerResult(results);
    updateTableTennisHandSelection(packets);
  }

  // Handle 3D scene for table tennis experiment
  if (currentExperimentId === "table-tennis" && getIsInitialized()) {
    handleTableTennis3D(deltaTime);
  }

  if (lastDetections.length > 0) {
    // Only draw hand points if debug is enabled
    if (debugToggleCheckbox.checked) {
      lastDetections.forEach((landmarks) =>
        drawHand(ctx, landmarks, canvas)
      );
    }
  }

  // Get experiment-specific debug info
  const debugGenerator = getDebugGenerator(currentExperimentId);
  const debug = debugGenerator(lastDetections);

  setDebug(debugContentEl, debug);

  requestAnimationFrame(renderLoop);
};

/**
 * Handles 3D interaction for table tennis experiment
 * Paddle follows the selected detected hand and updates ball physics.
 */
const handleTableTennis3D = (deltaTime) => {
  const packet =
    tableTennisFsm.dropoutFrames > 0
      ? lastStableTableTennisPacket
      : activeTableTennisPacket;

  if (
    !packet ||
    tableTennisFsm.dropoutFrames > TT_DROPOUT_HIDE_FRAMES
  ) {
    updateTableTennis({
      paddleVisible: false,
      deltaTime,
    });
    return;
  }

  const rawPos = getTableTennisPaddleAnchor(
    packet.landmarks,
    packet.handedness
  );
  const rawRot = getTableTennisPaddleRotation(
    packet.landmarks,
    packet.worldLandmarks,
    packet.handedness
  );
  const smoothed = smoothTableTennisPose(rawPos, rawRot);

  updateTableTennis({
    paddleVisible: true,
    paddlePosition: smoothed.position,
    paddleRotation: smoothed.rotation,
    gameplayRotationZ: smoothed.gameplayRotationZ,
    deltaTime,
  });
};

/**
 * Starts an experiment by hiding the selection screen and initializing the camera
 */
const startExperiment = async (experimentId) => {
  // Store current experiment ID
  currentExperimentId = experimentId;
  lastFrameTime = performance.now();
  resetTableTennisTracking();

  // Hide selection screen
  selectionScreen.classList.add("hidden");

  // Show debug panel
  debugEl.style.display = "block";

  // Initialize hand landmarker and start webcam
  await initHandLandmarker({
    gameMode: experimentId === "table-tennis" ? "table-tennis" : "default",
  });
  await startWebcam(video, canvas, () => {
    // Initialize 3D scene for table tennis experiment
    if (experimentId === "table-tennis") {
      initThreeScene(canvas3D, video);
      update3DSize(video.videoWidth, video.videoHeight);
    }
    renderLoop();
  });
};

/**
 * Sets up the selection screen with experiment buttons
 */
const setupSelectionScreen = () => {
  experiments.forEach((experiment) => {
    const button = document.createElement("button");
    button.textContent = experiment.name;
    button.addEventListener("click", () => {
      startExperiment(experiment.id);
    });
    experimentButtonsContainer.appendChild(button);
  });
};

/**
 * Sets up the debug toggle checkbox handler
 */
const setupDebugToggle = () => {
  debugToggleCheckbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      debugContentEl.classList.remove("hidden");
    } else {
      debugContentEl.classList.add("hidden");
    }
  });
};

/**
 * Initializes the application
 */
const init = () => {
  setupSelectionScreen();
  setupDebugToggle();
};

init();
