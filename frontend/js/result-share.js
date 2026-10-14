const DEVICE_JPEG_QUALITY = 0.92;
const PHOTO_UPLOAD_TIMEOUT_MS = 30000;
const DOWNLOAD_REVOKE_DELAY_MS = 10000;
const SECOND_DOWNLOAD_DELAY_MS = 150;
const MAX_VIDEO_DATA_CHARS = 3000000;

const SAVE_MESSAGES = {
  admin   : 'Foto tersimpan ke dashboard',
  customer: 'Foto tersimpan di perangkatmu.',
};

function buildBundleBaseName() {
  return `snapmomen-${Date.now()}`;
}

function isAdminUser() {
  return getStoredUser()?.role === 'admin';
}

function assertCanvasHasImage(canvas) {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Foto belum siap. Ulangi sesi foto.');
  }
}

function canvasToDeviceDataUrl(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', DEVICE_JPEG_QUALITY);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg')) {
    throw new Error('Gagal membuat file foto dari canvas.');
  }
  return dataUrl;
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal membuat file foto dari canvas.'));
    }, 'image/jpeg', DEVICE_JPEG_QUALITY);
  });
}

function isDownloadSupported() {
  return 'download' in document.createElement('a');
}

// Blob URL dipakai karena data URL besar sering diblokir Chrome saat didownload.
function triggerBlobDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), DOWNLOAD_REVOKE_DELAY_MS);
}

function waitMilliseconds(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

// Customer: foto lalu video (kalau ada), dua download terpisah dengan nama dasar sama.
async function saveCustomerBundle(canvas, videoBlob) {
  assertCanvasHasImage(canvas);
  if (!isDownloadSupported()) {
    throw new Error('Browser ini tidak mendukung download otomatis.');
  }
  const baseName = buildBundleBaseName();
  const photoBlob = await canvasToJpegBlob(canvas);
  triggerBlobDownload(photoBlob, `${baseName}.jpg`);
  if (!videoBlob) return;
  await waitMilliseconds(SECOND_DOWNLOAD_DELAY_MS);
  triggerBlobDownload(videoBlob, `${baseName}.${getVideoFileExtension(videoBlob)}`);
}

async function buildVideoPayload(videoBlob) {
  if (!videoBlob) return { has_video: false };
  const videoData = await blobToDataUrl(videoBlob);
  if (videoData.length > MAX_VIDEO_DATA_CHARS) {
    console.warn('Video terlalu besar, hanya foto yang disimpan.');
    return { has_video: false };
  }
  return { video_data: videoData, has_video: true };
}

async function uploadAdminPhoto(canvas, frameId, bundle) {
  assertCanvasHasImage(canvas);
  const imageData = compressCanvasForUpload(canvas);
  const thumbData = await createThumbnailDataUrl(imageData);
  const videoPayload = await buildVideoPayload(bundle.videoBlob);
  await apiRequest('/photos', {
    method: 'POST',
    body: {
      image_data: imageData,
      thumb_data: thumbData,
      frame_id: frameId,
      filter_name: bundle.filterName,
      ...videoPayload,
    },
    timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS,
  });
}

// Admin: simpan ke database dulu, print hanya jika simpan sukses.
async function saveAdminPhotoThenPrint(canvas, frameId, bundle) {
  const printableDataUrl = canvasToDeviceDataUrl(canvas);
  await uploadAdminPhoto(canvas, frameId, bundle);
  showToast(SAVE_MESSAGES.admin);
  await printPhoto(printableDataUrl);
}

// Customer: download ke device saja. Tanpa API, tanpa dialog printer.
async function saveCustomerBundleOnly(canvas, bundle) {
  await saveCustomerBundle(canvas, bundle.videoBlob);
  showToast(SAVE_MESSAGES.customer);
}

// Mengembalikan true kalau foto berhasil disimpan.
async function saveAndSharePhoto(canvas, frameId, bundle = {}) {
  try {
    if (isAdminUser()) await saveAdminPhotoThenPrint(canvas, frameId, bundle);
    else await saveCustomerBundleOnly(canvas, bundle);
    return true;
  } catch (err) {
    console.error('Simpan foto gagal:', err);
    showToast(`${err.message} Foto belum tersimpan, coba klik Simpan lagi.`);
    return false;
  }
}
