// Daftar filter foto dan preview live di lingkaran filter.
// Nilai css dipakai untuk preview video, preview lingkaran, dan saat foto diambil.

const FILTER_PREVIEW_SIZE = 72;
const FILTER_PREVIEW_INTERVAL_MS = 100;

const PHOTO_FILTERS = [
  { id: 'normal',  label: 'Normal',  css: 'none' },
  { id: 'bw',      label: 'B&W',     css: 'grayscale(1)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.6) contrast(1.1) saturate(0.8)' },
  { id: 'warm',    label: 'Warm',    css: 'sepia(0.3) saturate(1.4) hue-rotate(-10deg)' },
  { id: 'rose',    label: 'Rose',    css: 'sepia(0.2) saturate(1.3) hue-rotate(-20deg) brightness(1.05)' },
  { id: 'film',    label: 'Film',    css: 'contrast(1.2) saturate(0.9) sepia(0.1)' },
  { id: 'cool',    label: 'Cool',    css: 'saturate(1.1) hue-rotate(180deg) brightness(1.02)' },
  { id: 'dreamy',  label: 'Dreamy',  css: 'saturate(1.2) brightness(1.1) blur(0.5px)' },
  { id: 'vivid',   label: 'Vivid',   css: 'saturate(1.6) contrast(1.15)' },
];

let filterPreviewTimerId = null;

function findPhotoFilter(filterId) {
  return PHOTO_FILTERS.find((filter) => filter.id === filterId) || PHOTO_FILTERS[0];
}

function buildFilterButtonHtml(filter) {
  return `
    <button type="button" class="filter-item" data-filter-id="${filter.id}" aria-label="Filter ${filter.label}">
      <span class="filter-circle">
        <canvas class="filter-preview" width="${FILTER_PREVIEW_SIZE}" height="${FILTER_PREVIEW_SIZE}"
                data-filter="${filter.id}" style="filter:${filter.css}"></canvas>
      </span>
      <span class="filter-name">${filter.label}</span>
    </button>`;
}

// Ambil bagian tengah video berbentuk persegi, dibalik seperti preview kamera utama.
function drawVideoSquare(context, video) {
  const side = Math.min(video.videoWidth, video.videoHeight);
  const sourceX = (video.videoWidth - side) / 2;
  const sourceY = (video.videoHeight - side) / 2;
  context.save();
  context.translate(FILTER_PREVIEW_SIZE, 0);
  context.scale(-1, 1);
  context.drawImage(video, sourceX, sourceY, side, side, 0, 0, FILTER_PREVIEW_SIZE, FILTER_PREVIEW_SIZE);
  context.restore();
}

function drawFilterPreviews() {
  const video = document.getElementById('video');
  if (!video || video.readyState < 2 || !video.videoWidth) return;
  document.querySelectorAll('.filter-preview').forEach((canvas) => {
    drawVideoSquare(canvas.getContext('2d'), video);
  });
}

function stopFilterPreview() {
  clearInterval(filterPreviewTimerId);
  filterPreviewTimerId = null;
}

function startFilterPreview() {
  stopFilterPreview();
  drawFilterPreviews();
  filterPreviewTimerId = setInterval(drawFilterPreviews, FILTER_PREVIEW_INTERVAL_MS);
}