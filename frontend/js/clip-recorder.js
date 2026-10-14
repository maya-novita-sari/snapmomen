// Merekam video 3 detik saat countdown, lalu menyusun satu video bundle (bingkai + filter).
// Jika browser tidak mendukung perekaman, semua fungsi mengembalikan null dan foto tetap jalan.

const CLIP_FPS = 24;
const CLIP_BITS_PER_SECOND = 1200000;
const CLIP_CANVAS_WIDTH = 440;
const CLIP_CANVAS_HEIGHT = 304;
const BUNDLE_DURATION_MS = 3000;
const CLIP_LOAD_TIMEOUT_MS = 5000;
const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1',
  'video/mp4',
];

function getSupportedVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return '';
  return VIDEO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function getVideoFileExtension(videoBlob) {
  return videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Gagal membaca file video.'));
    reader.readAsDataURL(blob);
  });
}

function startCanvasRecorder(canvas) {
  const mimeType = getSupportedVideoMimeType();
  const recorder = new MediaRecorder(canvas.captureStream(CLIP_FPS), {
    mimeType,
    videoBitsPerSecond: CLIP_BITS_PER_SECOND,
  });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise((resolve) => {
    recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType }) : null);
    recorder.onerror = () => resolve(null);
  });
  recorder.start();
  return { recorder, finished };
}

function stopCanvasRecorder(recorder) {
  if (recorder.state !== 'inactive') recorder.stop();
}

function drawSourceCover(ctx, source, sourceWidth, sourceHeight, x, y, width, height) {
  if (!sourceWidth || !sourceHeight) return;
  const sourceRatio = sourceWidth / sourceHeight;
  const boxRatio = width / height;
  const cropWidth = sourceRatio > boxRatio ? sourceHeight * boxRatio : sourceWidth;
  const cropHeight = sourceRatio > boxRatio ? sourceHeight : sourceWidth / boxRatio;
  const cropX = (sourceWidth - cropWidth) / 2;
  const cropY = (sourceHeight - cropHeight) / 2;
  ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, x, y, width, height);
}

function drawMirroredFilteredVideo(ctx, video, filterCss, width, height) {
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.filter = filterCss;
  drawSourceCover(ctx, video, video.videoWidth, video.videoHeight, 0, 0, width, height);
  ctx.restore();
}

// Mulai merekam klip dari kamera (sudah mirror + filter). Mengembalikan { stop } atau null.
function startCountdownClip(video, getFilterCss) {
  if (!getSupportedVideoMimeType()) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = CLIP_CANVAS_WIDTH;
    canvas.height = CLIP_CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    const drawFrame = () => drawMirroredFilteredVideo(ctx, video, getFilterCss(), canvas.width, canvas.height);

    drawFrame();
    const { recorder, finished } = startCanvasRecorder(canvas);
    const timerId = setInterval(drawFrame, 1000 / CLIP_FPS);
    return {
      stop() {
        clearInterval(timerId);
        stopCanvasRecorder(recorder);
        return finished;
      },
    };
  } catch (err) {
    console.warn('Perekaman klip gagal:', err);
    return null;
  }
}

function loadClipVideo(clipBlob) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(clipBlob);
    const giveUp = setTimeout(() => resolve({ video: null, objectUrl }), CLIP_LOAD_TIMEOUT_MS);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => { clearTimeout(giveUp); resolve({ video, objectUrl }); };
    video.onerror = () => { clearTimeout(giveUp); resolve({ video: null, objectUrl }); };
    video.src = objectUrl;
  });
}

function drawBundleSlot(ctx, rect, layer) {
  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 6);
  ctx.clip();
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  const source = layer.video || layer.image;
  const sourceWidth = layer.video ? layer.video.videoWidth : layer.image?.width;
  const sourceHeight = layer.video ? layer.video.videoHeight : layer.image?.height;
  if (source) drawSourceCover(ctx, source, sourceWidth, sourceHeight, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawBundleFrame(ctx, layers, rects, frameImage, width, height) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  layers.forEach((layer, index) => drawBundleSlot(ctx, rects[index], layer));
  if (frameImage) ctx.drawImage(frameImage, 0, 0, width, height);
}

function releaseClipVideos(loadedClips) {
  loadedClips.forEach(({ video, objectUrl }) => {
    video?.pause();
    URL.revokeObjectURL(objectUrl);
  });
}

// clipBlobs dan slotImages sejajar dengan rects (satu entri per slot).
async function buildBundleVideo({ clipBlobs, slotImages, rects, frameImage, width, height }) {
  if (!getSupportedVideoMimeType() || !clipBlobs.some(Boolean)) return null;

  const loadedClips = await Promise.all(clipBlobs.map((blob) => (blob ? loadClipVideo(blob) : { video: null, objectUrl: '' })));
  try {
    const layers = loadedClips.map(({ video }, index) => ({ video, image: slotImages[index] }));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const render = () => drawBundleFrame(ctx, layers, rects, frameImage, width, height);

    render();
    const { recorder, finished } = startCanvasRecorder(canvas);
    await Promise.all(layers.map(({ video }) => video?.play().catch(() => {})));
    const timerId = setInterval(render, 1000 / CLIP_FPS);
    await new Promise((resolve) => setTimeout(resolve, BUNDLE_DURATION_MS));
    clearInterval(timerId);
    render();
    stopCanvasRecorder(recorder);
    return await finished;
  } catch (err) {
    console.warn('Gagal menyusun video bundle:', err);
    return null;
  } finally {
    releaseClipVideos(loadedClips);
  }
}


// ---------- Putar ulang langsung (tanpa menunggu video selesai dienkode) ----------

async function loadReplayLayers(clipBlobs, slotImages) {
  const loadedClips = await Promise.all(clipBlobs.map((blob) => (blob ? loadClipVideo(blob) : { video: null, objectUrl: '' })));
  return {
    layers: loadedClips.map(({ video }, index) => ({ video, image: slotImages[index] })),
    release: () => releaseClipVideos(loadedClips),
  };
}

function hasPlayableClip(layers) {
  return layers.some((layer) => layer.video);
}

// Menggambar klip ke canvas tampilan. Dengan loop, klip diulang terus sampai stop dipanggil.
function startLiveReplay({ canvas, layers, rects, frameImage, onEnd, loop = false }) {
  const ctx = canvas.getContext('2d');
  const render = () => drawBundleFrame(ctx, layers, rects, frameImage, canvas.width, canvas.height);
  const restartClips = () => layers.forEach(({ video }) => {
    if (!video) return;
    video.currentTime = 0;
    video.play().catch(() => {});
  });

  restartClips();
  render();
  const timerId = setInterval(render, 1000 / CLIP_FPS);
  const cycleId = loop
    ? setInterval(restartClips, BUNDLE_DURATION_MS)
    : setTimeout(() => { stopPlayback(); onEnd?.(); }, BUNDLE_DURATION_MS);

  function stopPlayback() {
    clearInterval(timerId);
    clearInterval(cycleId);
    clearTimeout(cycleId);
    layers.forEach(({ video }) => video?.pause());
  }
  return { stop: stopPlayback };
}