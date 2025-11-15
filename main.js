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
const ctx = canvas.getContext("2d");

let lastDetections = null;

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
    lastDetections.forEach((landmarks) =>
      drawHand(ctx, landmarks, canvas)
    );

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

  setDebug(debugEl, debug);

  requestAnimationFrame(renderLoop);
};

/**
 * Initializes the application
 */
const init = async () => {
  await initHandLandmarker();
  await startWebcam(video, canvas, renderLoop);
};

init();
