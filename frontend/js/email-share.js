// Kirim foto dan video hasil ke email customer lewat API /send-email.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_SEND_TIMEOUT_MS = 40000;
const EMAIL_MAX_VIDEO_DATA_CHARS = 3000000;

function isValidEmailAddress(email) {
  return EMAIL_PATTERN.test(email);
}

async function buildEmailVideoData(videoBlob) {
  if (!videoBlob) return null;
  const videoData = await blobToDataUrl(videoBlob);
  return videoData.length <= EMAIL_MAX_VIDEO_DATA_CHARS ? videoData : null;
}

async function sendResultByEmail(canvas, videoBlob, email) {
  assertCanvasHasImage(canvas);
  await apiRequest('/send-email', {
    method: 'POST',
    body: {
      email,
      image_data: canvasToDeviceDataUrl(canvas),
      video_data: await buildEmailVideoData(videoBlob),
    },
    timeoutMs: EMAIL_SEND_TIMEOUT_MS,
  });
}
