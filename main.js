import { setDebug, dist } from "./utils.js";
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
} from "./handDetection.js";

const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const debugEl = document.getElementById("debug");
const debugContentEl = document.getElementById("debug-content");
const debugToggleCheckbox = document.getElementById("debug-toggle-checkbox");
const selectionScreen = document.getElementById("selection-screen");
const experimentButtonsContainer = document.getElementById("experiment-buttons");
const ctx = canvas.getContext("2d");

let lastDetections = null;

// Array of available experiments
const experiments = [
  { name: "Fist Bump", id: "fist-bump" },
];

/**
 * Main render loop for hand detection and gesture recognition
 * Detects hands, analyzes gestures, and triggers effects
 */
const renderLoop = () => {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const handLandmarker = getHandLandmarker();
  const results = handLandmarker.detectForVideo(video, performance.now());
  lastDetections = results.landmarks || [];

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

  if (lastDetections.length > 0) {
    // Only draw hand points if debug is enabled
    if (debugToggleCheckbox.checked) {
      lastDetections.forEach((landmarks) =>
        drawHand(ctx, landmarks, canvas)
      );
    }

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
  }

  setDebug(debugContentEl, debug);

  requestAnimationFrame(renderLoop);
};

/**
 * Starts an experiment by hiding the selection screen and initializing the camera
 */
const startExperiment = async (experimentId) => {
  // Hide selection screen
  selectionScreen.classList.add("hidden");
  
  // Show debug panel
  debugEl.style.display = "block";
  
  // Initialize hand landmarker and start webcam
  await initHandLandmarker();
  await startWebcam(video, canvas, renderLoop);
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
