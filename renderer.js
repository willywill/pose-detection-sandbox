let lastBumpTime = 0;

/**
 * Draws hand landmarks on the canvas
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {Array} landmarks - Array of hand landmark coordinates
 * @param {HTMLCanvasElement} canvas - The canvas element
 */
export const drawHand = (ctx, landmarks, canvas) => {
  ctx.fillStyle = "cyan";
  landmarks.forEach((pt) => {
    ctx.fillRect(pt.x * canvas.width, pt.y * canvas.height, 4, 4);
  });
};

/**
 * Triggers confetti animation at specified coordinates
 * @param {number} x - Normalized x coordinate (0-1)
 * @param {number} y - Normalized y coordinate (0-1)
 * @param {string} msg - Optional message to log
 */
export const triggerConfetti = (x, y, msg = "") => {
  const now = performance.now();
  if (now - lastBumpTime < 1000) return;
  lastBumpTime = now;

  window.confetti({
    particleCount: 150,
    spread: 360,
    startVelocity: 45,
    gravity: 1.2,
    origin: { x, y },
    angle: 90,
    ticks: 200,
  });

  console.log("CONFETTI:", msg);
};

