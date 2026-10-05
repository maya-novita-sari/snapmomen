// Daftar filter foto. Nilai css dipakai untuk preview video dan saat foto diambil.

const PHOTO_FILTERS = [
  { id: 'normal',   label: 'Normal',   css: 'none' },
  { id: 'bw',       label: 'B&W',      css: 'grayscale(1) contrast(1.05)' },
  { id: 'vintage',  label: 'Vintage',  css: 'grayscale(1) sepia(0.65) contrast(1.08) brightness(0.96)' },
  { id: 'warm',     label: 'Warm',     css: 'sepia(0.22) saturate(1.3) brightness(1.05) hue-rotate(-8deg)' },
  { id: 'rose',     label: 'Rose',     css: 'sepia(0.15) saturate(1.15) brightness(1.08) contrast(0.92) hue-rotate(-14deg)' },
  { id: 'film',     label: 'Film',     css: 'sepia(0.2) saturate(1.2) contrast(1.12) brightness(0.98)' },
  { id: 'cool',     label: 'Cool',     css: 'saturate(0.9) hue-rotate(12deg) brightness(1.05) contrast(0.96)' },
  { id: 'dreamy',   label: 'Dreamy',   css: 'contrast(0.84) brightness(1.13) saturate(0.95)' },
  { id: 'vivid',    label: 'Vivid',    css: 'saturate(1.55) contrast(1.1)' },
];

const FILTER_SWATCH_GRADIENT =
  'linear-gradient(135deg, #f6c9a6 0%, #e8836a 35%, #6fa8c8 70%, #7fb685 100%)';

function findPhotoFilter(filterId) {
  return PHOTO_FILTERS.find((filter) => filter.id === filterId) || PHOTO_FILTERS[0];
}

function buildFilterButtonHtml(filter) {
  return `
    <button type="button" class="filter-item" data-filter-id="${filter.id}" aria-label="Filter ${filter.label}">
      <span class="filter-circle" style="background:${FILTER_SWATCH_GRADIENT};filter:${filter.css}"></span>
      <span class="filter-name">${filter.label}</span>
    </button>`;
}