import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { dist } from "./utils.js";

let handLandmarker = null;

/**
 * Initializes the MediaPipe Hand Landmarker with GPU acceleration
 */
export const initHandLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      delegate: "GPU",
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });
};

/**
 * Gets the current hand landmarker instance
 * @returns {HandLandmarker|null} The hand landmarker instance
 */
export const getHandLandmarker = () => handLandmarker;

/**
 * Detects if a hand is making a fist gesture
 * @param {Array} hand - Array of hand landmarks
 * @returns {boolean} True if hand is in fist position
 */
export const isFist = (hand) => {
  const tipIds = [8, 12, 16, 20];
  let folded = 0;

  tipIds.forEach((id) => {
    const tip = hand[id];
    const mcp = hand[id - 2];
    if (dist(tip, mcp) < 0.05) folded++;
  });

  return folded >= 3;
};

/**
 * Determines the orientation of a fist gesture
 * @param {Array} hand - Array of hand landmarks
 * @returns {string} 'left', 'right', 'up', or 'unknown'
 */
export const getFistOrientation = (hand) => {
  const wrist = hand[0];
  const middleKnuckle = hand[9]; // Middle finger MCP (knuckle)

  const dx = middleKnuckle.x - wrist.x;
  const dy = middleKnuckle.y - wrist.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  } else if (dy < -0.05) {
    return "up";
  }

  return "unknown";
};

/**
 * Detects peace sign gesture (index and middle fingers up, others curled)
 * @param {Array} hand - Array of hand landmarks
 * @returns {boolean} True if hand is making peace sign
 */
export const isPeace = (hand) => {
  const finger = (tip, mcp) => dist(hand[tip], hand[mcp]) > 0.09;

  const indexUp = finger(8, 5);
  const middleUp = finger(12, 9);
  const ringDown = dist(hand[16], hand[14]) < 0.05;
  const pinkyDown = dist(hand[20], hand[18]) < 0.05;

  return indexUp && middleUp && ringDown && pinkyDown;
};

/**
 * Detects thumbs up gesture
 * @param {Array} hand - Array of hand landmarks
 * @returns {boolean} True if hand is making thumbs up
 */
export const isThumbsUp = (hand) => {
  const thumbTip = hand[4];
  const thumbIP = hand[3];
  const thumbCMC = hand[1];
  const wrist = hand[0];

  const thumbExtended = dist(thumbTip, thumbIP) > 0.07;
  const thumbFarFromPalm = dist(thumbTip, wrist) > dist(thumbCMC, wrist);

  return thumbExtended && thumbFarFromPalm;
};

/**
 * Checks if two hands are close enough for a fist bump
 * @param {Array} handA - First hand landmarks
 * @param {Array} handB - Second hand landmarks
 * @returns {boolean} True if hands are close
 */
export const handsClose = (handA, handB) => dist(handA[0], handB[0]) < 0.25;

/**
 * Calculates the rotation of a fist gesture in 3D space
 * Uses wrist, middle finger MCP, and thumb positions to determine orientation
 * @param {Array} hand - Array of hand landmarks
 * @returns {Object} Object with x, y, z rotation values in radians (Euler angles)
 */
export const getFistRotation = (hand) => {
  const wrist = hand[0];
  const middleKnuckle = hand[9]; // Middle finger MCP
  const thumbTip = hand[4];
  const indexKnuckle = hand[5]; // Index finger MCP

  // Calculate forward vector (from wrist to middle knuckle)
  const forwardX = middleKnuckle.x - wrist.x;
  const forwardY = middleKnuckle.y - wrist.y;
  const forwardZ = (middleKnuckle.z || 0) - (wrist.z || 0);

  // Calculate right vector (from wrist to thumb/index knuckle)
  const rightX = thumbTip.x - wrist.x;
  const rightY = thumbTip.y - wrist.y;
  const rightZ = (thumbTip.z || 0) - (wrist.z || 0);

  // Normalize forward vector
  const forwardLength = Math.sqrt(forwardX * forwardX + forwardY * forwardY + forwardZ * forwardZ);
  if (forwardLength < 0.001) {
    return { x: 0, y: 0, z: 0 }; // Default rotation if hand is too flat
  }

  const fnX = forwardX / forwardLength;
  const fnY = forwardY / forwardLength;
  const fnZ = forwardZ / forwardLength;

  // Calculate yaw (rotation around Y axis) - horizontal rotation
  const yaw = Math.atan2(fnX, fnZ);

  // Calculate pitch (rotation around X axis) - vertical rotation
  const pitch = -Math.asin(fnY);

  // Calculate roll (rotation around Z axis) - tilt rotation
  // Use the right vector projected onto the XY plane
  const rightLength = Math.sqrt(rightX * rightX + rightY * rightY);
  let roll = 0;
  if (rightLength > 0.001) {
    // Project right vector onto plane perpendicular to forward vector
    const rightNormX = rightX / rightLength;
    const rightNormY = rightY / rightLength;
    
    // Calculate angle between right vector and horizontal
    roll = Math.atan2(rightNormY, rightNormX) - Math.PI / 2;
  }

  return {
    x: pitch,  // Rotation around X axis
    y: yaw,    // Rotation around Y axis
    z: roll,   // Rotation around Z axis
  };
};

