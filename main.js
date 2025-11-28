import { setDebug, dist, handTo3D, dist3D } from "./utils.js";
import { startWebcam } from "./camera.js";
import { drawHand, triggerConfetti } from "./renderer.js";
import {
  initHandLandmarker,
  getHandLandmarker,
  isFist,
  getFistOrientation,
  isPeace,
  isThumbsUp,
  handsClose,
  getFistRotation,
} from "./handDetection.js";
import {
  initThreeScene,
  setCylinderPosition,
  setCylinderRotation,
  setCylinderVisibility,
  getCylinderPosition,
  resetCylinderPosition,
  render as render3D,
  updateSize as update3DSize,
  getIsInitialized,
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

// Array of available experiments
const experiments = [
  { name: "Fist Bump", id: "fist-bump" },
  { name: "Table Tennis", id: "table-tennis" },
];

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
  };

  if (lastDetections.length > 0) {
    const handA = lastDetections[0];
    const handA3D = handTo3D(handA, canvas.width, canvas.height);
    const handAFist = isFist(handA);
    const handARotation = handAFist ? getFistRotation(handA) : null;
    
    debug.handA_fist = handAFist;
    debug.handA_pos3D = `(${handA3D.x.toFixed(2)}, ${handA3D.y.toFixed(2)}, ${handA3D.z.toFixed(2)})`;
    
    if (handARotation) {
      debug.handA_rotation = `P:${(handARotation.x * 180 / Math.PI).toFixed(1)}° Y:${(handARotation.y * 180 / Math.PI).toFixed(1)}° R:${(handARotation.z * 180 / Math.PI).toFixed(1)}°`;
    }

    if (lastDetections.length > 1) {
      const handB = lastDetections[1];
      const handB3D = handTo3D(handB, canvas.width, canvas.height);
      const handBFist = isFist(handB);
      const handBRotation = handBFist ? getFistRotation(handB) : null;
      
      debug.handB_fist = handBFist;
      debug.handB_pos3D = `(${handB3D.x.toFixed(2)}, ${handB3D.y.toFixed(2)}, ${handB3D.z.toFixed(2)})`;
      
      if (handBRotation) {
        debug.handB_rotation = `P:${(handBRotation.x * 180 / Math.PI).toFixed(1)}° Y:${(handBRotation.y * 180 / Math.PI).toFixed(1)}° R:${(handBRotation.z * 180 / Math.PI).toFixed(1)}°`;
      }
    }
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
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const handLandmarker = getHandLandmarker();
  const results = handLandmarker.detectForVideo(video, performance.now());
  lastDetections = results.landmarks || [];

  // Handle 3D scene for table tennis experiment
  if (currentExperimentId === "table-tennis" && getIsInitialized()) {
    handleTableTennis3D();
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
 * Cylinder always follows hand A when it's in fist pose
 */
const handleTableTennis3D = () => {
  if (!lastDetections || lastDetections.length === 0) {
    // Hide cylinder when no hands detected
    setCylinderVisibility(false);
    render3D();
    return;
  }

  // Always use hand A (first hand)
  const handA = lastDetections[0];
  const handA3D = handTo3D(handA, canvas.width, canvas.height);
  const handAFist = isFist(handA);

  if (handAFist) {
    // Show cylinder and follow hand A position and rotation
    setCylinderVisibility(true);
    setCylinderPosition(handA3D.x, handA3D.y, handA3D.z);
    const rotation = getFistRotation(handA);
    setCylinderRotation(rotation.x, rotation.y, rotation.z);
  } else {
    // Hide cylinder when hand A is not in fist pose
    setCylinderVisibility(false);
  }

  render3D();
};

/**
 * Starts an experiment by hiding the selection screen and initializing the camera
 */
const startExperiment = async (experimentId) => {
  // Store current experiment ID
  currentExperimentId = experimentId;
  
  // Hide selection screen
  selectionScreen.classList.add("hidden");
  
  // Show debug panel
  debugEl.style.display = "block";
  
  // Initialize hand landmarker and start webcam
  await initHandLandmarker();
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
