/**
 * Updates the debug panel with current detection information
 * @param {HTMLElement} debugContentEl - The debug content element to update
 * @param {Object} info - Key-value pairs to display
 */
export const setDebug = (debugContentEl, info) => {
  let txt = "";
  
  // Detection Info Section
  txt += "Detection Info\n";
  txt += "───────────────\n";
  txt += `Hands: ${info.hands}\n`;
  txt += `Distance: ${info.distance}\n`;
  if (info.grabbed !== undefined) {
    txt += `Grabbed: ${info.grabbed}\n`;
  }
  txt += "\n";
  
  // Hand A Gestures Section
  txt += "Hand A Gestures\n";
  txt += "───────────────\n";
  txt += `Fist: ${info.handA_fist}\n`;
  txt += `Peace: ${info.handA_peace}\n`;
  txt += `Thumbs Up: ${info.handA_thumb}\n`;
  txt += `Orientation: ${info.handA_orient}\n`;
  if (info.handA_pos3D !== undefined && info.handA_pos3D !== "-") {
    txt += `3D Position: ${info.handA_pos3D}\n`;
  }
  if (info.handA_rotation !== undefined && info.handA_rotation !== "-") {
    txt += `Rotation: ${info.handA_rotation}\n`;
  }
  if (info.handA_to_cylinder_dist !== undefined && info.handA_to_cylinder_dist !== "-") {
    txt += `To Cylinder: ${info.handA_to_cylinder_dist}\n`;
  }
  txt += "\n";
  
  // Hand B Gestures Section
  if (info.handB_fist !== undefined) {
    txt += "Hand B Gestures\n";
    txt += "───────────────\n";
    txt += `Fist: ${info.handB_fist}\n`;
    txt += `Peace: ${info.handB_peace}\n`;
    txt += `Thumbs Up: ${info.handB_thumb}\n`;
    txt += `Orientation: ${info.handB_orient}\n`;
    if (info.handB_pos3D !== undefined && info.handB_pos3D !== "-") {
      txt += `3D Position: ${info.handB_pos3D}\n`;
    }
    if (info.handB_rotation !== undefined && info.handB_rotation !== "-") {
      txt += `Rotation: ${info.handB_rotation}\n`;
    }
    if (info.handB_to_cylinder_dist !== undefined && info.handB_to_cylinder_dist !== "-") {
      txt += `To Cylinder: ${info.handB_to_cylinder_dist}\n`;
    }
    txt += "\n";
  }
  
  // Interaction Section
  if (info.facing !== undefined) {
    txt += "Interaction\n";
    txt += "───────────────\n";
    txt += `Facing Each Other: ${info.facing}\n`;
    txt += `Close: ${info.close}\n`;
  }
  
  debugContentEl.textContent = txt;
};

/**
 * Calculate distance between two 3D landmarks
 * @param {Object} a - First landmark with x, y properties
 * @param {Object} b - Second landmark with x, y properties
 * @returns {number} Distance between landmarks
 */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Calculate 3D distance between two landmarks (including z if available)
 * @param {Object} a - First landmark with x, y, z properties
 * @param {Object} b - Second landmark with x, y, z properties
 * @returns {number} 3D distance between landmarks
 */
export const dist3D = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Estimates hand depth (z coordinate) from hand size
 * Uses the distance between wrist and middle finger MCP as a proxy for hand size
 * @param {Array} hand - Array of hand landmarks
 * @returns {number} Estimated depth value (normalized)
 */
export const estimateHandDepth = (hand) => {
  const wrist = hand[0];
  const middleKnuckle = hand[9];
  const handSize = dist(wrist, middleKnuckle);
  
  // Normalize hand size to depth estimate
  // Larger hands appear closer (more negative z in Three.js)
  // Typical hand size is around 0.1-0.15 in normalized coordinates
  const baseDepth = -2.5; // Base depth in 3D space
  const depthRange = 2.0; // Range of depth variation
  const normalizedSize = Math.max(0.05, Math.min(0.2, handSize)); // Clamp to reasonable range
  const depth = baseDepth - (normalizedSize - 0.05) * (depthRange / 0.15);
  
  return depth;
};

/**
 * Converts normalized hand landmark coordinates (0-1) to 3D world coordinates
 * @param {Object} landmark - Landmark with x, y, z properties (normalized 0-1)
 * @param {number} canvasWidth - Width of the canvas/video
 * @param {number} canvasHeight - Height of the canvas/video
 * @param {number} depth - Z coordinate in 3D space (optional, will estimate if not provided)
 * @returns {Object} Object with x, y, z coordinates in 3D world space
 */
export const landmarkTo3D = (landmark, canvasWidth, canvasHeight, depth = null) => {
  // Map normalized x (0-1) to 3D x (-width/2 to width/2)
  // Scale to reasonable 3D world units (assuming camera FOV of 75 degrees)
  const fov = 75;
  const aspect = canvasWidth / canvasHeight;
  const fovRad = (fov * Math.PI) / 180;
  const distance = 5; // Distance from camera
  
  // Calculate world space dimensions at the given distance
  const worldHeight = 2 * Math.tan(fovRad / 2) * distance;
  const worldWidth = worldHeight * aspect;
  
  // Convert normalized coordinates to world space
  // X: 0-1 maps to -worldWidth/2 to worldWidth/2
  const x = (landmark.x - 0.5) * worldWidth;
  
  // Y: 0-1 maps to worldHeight/2 to -worldHeight/2 (inverted for Three.js)
  const y = (0.5 - landmark.y) * worldHeight;
  
  // Z: Use provided depth or estimate from hand size
  const z = depth !== null ? depth : -2.5;
  
  return { x, y, z };
};

/**
 * Converts hand wrist position to 3D coordinates
 * @param {Array} hand - Array of hand landmarks
 * @param {number} canvasWidth - Width of the canvas/video
 * @param {number} canvasHeight - Height of the canvas/video
 * @returns {Object} Object with x, y, z coordinates in 3D world space
 */
export const handTo3D = (hand, canvasWidth, canvasHeight) => {
  const wrist = hand[0];
  const depth = estimateHandDepth(hand);
  return landmarkTo3D(wrist, canvasWidth, canvasHeight, depth);
};

/**
 * Checks if a hand position is within grab range of the cylinder
 * @param {Object} handPos3D - Hand position in 3D space {x, y, z}
 * @param {Object} cylinderPos3D - Cylinder position in 3D space {x, y, z}
 * @param {number} grabThreshold - Maximum distance for grab (default: 0.8)
 * @returns {boolean} True if hand is within grab range
 */
export const isHandNearCylinder = (handPos3D, cylinderPos3D, grabThreshold = 0.8) => {
  if (!handPos3D || !cylinderPos3D) return false;
  const distance = dist3D(handPos3D, cylinderPos3D);
  return distance <= grabThreshold;
};

