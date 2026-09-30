const DEVICE_JPEG_QUALITY = 0.92;
const PHOTO_UPLOAD_TIMEOUT_MS = 30000;
const DOWNLOAD_REVOKE_DELAY_MS = 10000;

const SAVE_MESSAGES = {
  admin   : 'Foto tersimpan ke dashboard',
  customer: 'Foto tersimpan di perangkatmu.',
};

function buildPhotoFileName() {
  return `snapmomen-${Date.now()}.jpg`;
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

async function saveCustomerPhoto(canvas) {
  assertCanvasHasImage(canvas);
  if (!isDownloadSupported()) {
    throw new Error('Browser ini tidak mendukung download otomatis.');
  }
  const blob = await canvasToJpegBlob(canvas);
  triggerBlobDownload(blob, buildPhotoFileName());
}

async function uploadAdminPhoto(canvas, frameId) {
  assertCanvasHasImage(canvas);
  const imageData = compressCanvasForUpload(canvas);
  const thumbData = await createThumbnailDataUrl(imageData);
  await apiRequest('/photos', {
    method: 'POST',
    body: { image_data: imageData, thumb_data: thumbData, frame_id: frameId },
    timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS,
  });
}

// Admin: simpan ke database dulu, print hanya jika simpan sukses.
async function saveAdminPhotoThenPrint(canvas, frameId) {
  const printableDataUrl = canvasToDeviceDataUrl(canvas);
  await uploadAdminPhoto(canvas, frameId);
  showToast(SAVE_MESSAGES.admin);
  await printPhoto(printableDataUrl);
}

// Customer: download ke device saja. Tanpa API, tanpa dialog printer.
async function saveCustomerPhotoOnly(canvas) {
  await saveCustomerPhoto(canvas);
  showToast(SAVE_MESSAGES.customer);
}

async function saveAndSharePhoto(canvas, frameId) {
  try {
    if (isAdminUser()) await saveAdminPhotoThenPrint(canvas, frameId);
    else await saveCustomerPhotoOnly(canvas);
  } catch (err) {
    console.error('Simpan foto gagal:', err);
    showToast(`${err.message} Foto belum tersimpan, coba klik Simpan lagi.`);
  }
}
