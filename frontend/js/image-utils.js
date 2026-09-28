// Shared image helpers used by the studio and the admin dashboard.

const THUMBNAIL_MAX_SIDE = 480;
const THUMBNAIL_QUALITY = 0.7;
const UPLOAD_MAX_DATA_URL_CHARS = 1400000;
const UPLOAD_QUALITY_STEPS = [0.7, 0.6, 0.5, 0.4, 0.3];
const UPLOAD_SIZE_ERROR = 'Foto terlalu besar. Coba kurangi ukurannya.';

function loadImageFromSource(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('File gambar tidak bisa dibaca.'));
    image.src = source;
  });
}

async function loadImageFromFile(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageFromSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File tidak bisa dibaca.'));
    reader.readAsDataURL(file);
  });
}

function renderImageToCanvas(image, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function scaleToFitSide(image, maxSide) {
  return Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
}

// Smaller JPEG copy used for lists so the API never sends full-size photos in bulk.
async function createThumbnailDataUrl(imageSource) {
  const image = await loadImageFromSource(imageSource);
  const canvas = renderImageToCanvas(image, scaleToFitSide(image, THUMBNAIL_MAX_SIDE));
  return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
}

// Lowers JPEG quality (then size) until the data URL fits the upload limit.
function compressCanvasForUpload(sourceCanvas) {
  for (const quality of UPLOAD_QUALITY_STEPS) {
    const dataUrl = sourceCanvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= UPLOAD_MAX_DATA_URL_CHARS) return dataUrl;
  }
  throw new Error(UPLOAD_SIZE_ERROR);
}

async function compressImageFileForUpload(file) {
  const image = await loadImageFromFile(file);
  let scale = scaleToFitSide(image, 1600);
  while (scale > 0.3) {
    try {
      return compressCanvasForUpload(renderImageToCanvas(image, scale));
    } catch {
      scale *= 0.8;
    }
  }
  throw new Error(UPLOAD_SIZE_ERROR);
}

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}