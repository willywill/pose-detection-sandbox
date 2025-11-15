/**
 * Updates the debug panel with current detection information
 * @param {HTMLElement} debugEl - The debug element to update
 * @param {Object} info - Key-value pairs to display
 */
export const setDebug = (debugEl, info) => {
  let txt = "";
  
  // Detection Info Section
  txt += "Detection Info\n";
  txt += "───────────────\n";
  txt += `Hands: ${info.hands}\n`;
  txt += `Distance: ${info.distance}\n`;
  txt += "\n";
  
  // Hand A Gestures Section
  txt += "Hand A Gestures\n";
  txt += "───────────────\n";
  txt += `Fist: ${info.handA_fist}\n`;
  txt += `Peace: ${info.handA_peace}\n`;
  txt += `Thumbs Up: ${info.handA_thumb}\n`;
  txt += `Orientation: ${info.handA_orient}\n`;
  txt += "\n";
  
  // Hand B Gestures Section
  txt += "Hand B Gestures\n";
  txt += "───────────────\n";
  txt += `Fist: ${info.handB_fist}\n`;
  txt += `Peace: ${info.handB_peace}\n`;
  txt += `Thumbs Up: ${info.handB_thumb}\n`;
  txt += `Orientation: ${info.handB_orient}\n`;
  txt += "\n";
  
  // Interaction Section
  txt += "Interaction\n";
  txt += "───────────────\n";
  txt += `Facing Each Other: ${info.facing}\n`;
  txt += `Close: ${info.close}\n`;
  
  debugEl.textContent = txt;
};

/**
 * Calculate distance between two 3D landmarks
 * @param {Object} a - First landmark with x, y properties
 * @param {Object} b - Second landmark with x, y properties
 * @returns {number} Distance between landmarks
 */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

