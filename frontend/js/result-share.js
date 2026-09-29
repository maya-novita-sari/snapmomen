const DEVICE_JPEG_QUALITY = 0.95;
const PHOTO_UPLOAD_TIMEOUT_MS = 30000;

const SAVE_SUCCESS_MESSAGES = {
  device  : 'Foto tersimpan di perangkatmu.',
  database: 'Foto tersimpan ke dashboard admin',
};

function buildPhotoFileName() {
  return `snapmomen-${Date.now()}.jpg`;
}

function isAdminUser() {
  return getStoredUser()?.role === 'admin';
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

// Admin: kirim ke API saja. Customer: download ke device saja.
async function saveResultPhoto(canvas, frameId) {
  if (isAdminUser()) {
    await uploadAdminPhoto(canvas, frameId);
    return 'database';
  }
  saveCustomerPhoto(canvas);
  return 'device';
}

async function saveAndSharePhoto(canvas, frameId) {
  const printableDataUrl = canvasToDeviceDataUrl(canvas);
  try {
    const mode = await saveResultPhoto(canvas, frameId);
    showToast(SAVE_SUCCESS_MESSAGES[mode]);
  } catch (err) {
    console.error('Simpan foto gagal:', err);
    showToast(`${err.message} Foto belum tersimpan, coba klik Simpan lagi.`);
  }
  await printPhoto(printableDataUrl);
}
