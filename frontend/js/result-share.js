const DEVICE_JPEG_QUALITY = 0.95;
const PHOTO_UPLOAD_TIMEOUT_MS = 30000;

const SAVE_SUCCESS_MESSAGES = {
  device  : 'Foto tersimpan di perangkatmu.',
  database: 'Foto masuk dashboard admin dan otomatis terhapus dalam 3 hari.',
};

function buildPhotoFileName() {
  return `snapmomen-${Date.now()}.jpg`;
}

function canvasToDeviceDataUrl(canvas) {
  return canvas.toDataURL('image/jpeg', DEVICE_JPEG_QUALITY);
}

async function uploadAdminPhoto(canvas, frameId) {
  const imageData = compressCanvasForUpload(canvas);
  const thumbData = await createThumbnailDataUrl(imageData);
  await apiRequest('/photos', {
    method: 'POST',
    body: { image_data: imageData, thumb_data: thumbData, frame_id: frameId },
    timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS,
  });
}

function saveCustomerPhoto(canvas) {
  downloadDataUrl(canvasToDeviceDataUrl(canvas), buildPhotoFileName());
}

async function saveResultPhoto(canvas, frameId) {
  const user = getStoredUser();
  if (user?.role === 'admin') {
    await uploadAdminPhoto(canvas, frameId);
    return 'database';
  }
  saveCustomerPhoto(canvas);
  return 'device';
}

async function saveAndSharePhoto(canvas, frameId) {
  let printableDataUrl = null;
  try {
    printableDataUrl = canvasToDeviceDataUrl(canvas);
    const mode = await saveResultPhoto(canvas, frameId);
    showToast(SAVE_SUCCESS_MESSAGES[mode]);
  } catch (err) {
    console.error('Simpan foto gagal:', err);
    if (printableDataUrl) downloadDataUrl(printableDataUrl, buildPhotoFileName());
    showToast(printableDataUrl
      ? `${err.message} Foto diunduh ke perangkatmu sebagai cadangan.`
      : `${err.message} Muat ulang bingkai lalu coba lagi.`);
  }
  if (printableDataUrl) await printPhoto(printableDataUrl);
}