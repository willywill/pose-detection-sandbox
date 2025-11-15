/**
 * Starts the webcam stream and sets up the video element
 * @param {HTMLVideoElement} video - The video element to use
 * @param {HTMLCanvasElement} canvas - The canvas element to sync dimensions
 * @param {Function} onReady - Callback when video is loaded and ready
 */
export const startWebcam = async (video, canvas, onReady) => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });

  video.srcObject = stream;

  video.addEventListener("loadeddata", () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    onReady();
  });
};

