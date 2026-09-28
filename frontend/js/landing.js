const GALLERY_PAGE_SIZE = 12;
const EMPTY_GALLERY_HTML = '<p style="opacity:.6">Belum ada foto di galeri.</p>';
const EMPTY_SHOWCASE_HTML = '<p style="opacity:.6">Belum ada bingkai.</p>';

let galleryOffset = 0;

function goToStudio() {
  if (getStoredUser()) location.href = 'studio.html';
  else location.href = 'login.html?redirect=studio.html';
}

function setupStartButtons() {
  ['ctaStartBtn', 'ctaBottomBtn'].forEach((buttonId) => {
    document.getElementById(buttonId).addEventListener('click', (event) => {
      event.preventDefault();
      goToStudio();
    });
  });
}

// ---------- Gallery ----------

function buildGalleryItemHtml(photo) {
  const caption = escapeHtml(photo.caption || 'Hasil foto Snapmomen');
  return `<img src="${photo.thumb_data}" alt="${caption}" loading="lazy" decoding="async">`;
}

async function loadGalleryPage() {
  const grid = document.getElementById('galleryGrid');
  const moreButton = document.getElementById('galleryMoreBtn');
  moreButton.disabled = true;

  try {
    const { photos, has_more: hasMore } = await apiRequest(
      `/photos?type=galeri&limit=${GALLERY_PAGE_SIZE}&offset=${galleryOffset}`,
      { auth: false },
    );
    if (galleryOffset === 0) grid.innerHTML = '';
    grid.insertAdjacentHTML('beforeend', photos.map(buildGalleryItemHtml).join(''));
    galleryOffset += photos.length;
    if (!grid.children.length) grid.innerHTML = EMPTY_GALLERY_HTML;
    moreButton.style.display = hasMore ? 'inline-flex' : 'none';
  } catch {
    if (galleryOffset === 0) grid.innerHTML = EMPTY_GALLERY_HTML;
    moreButton.style.display = 'none';
  } finally {
    moreButton.disabled = false;
  }
}

// ---------- Frame showcase ----------

function buildFrameCardHtml(frame) {
  const isFree = frame.category === 'free';
  const badgeClass = isFree ? 'badge-free' : 'badge-premium';
  return `
    <div class="frame-card">
      <img class="swatch" src="${frame.image_url}" alt="${escapeHtml(frame.name)}" loading="lazy" decoding="async">
      <div style="font-weight:700">${escapeHtml(frame.name)}</div>
      <span class="badge ${badgeClass}">${isFree ? 'GRATIS' : 'PREMIUM'}</span>
    </div>`;
}

async function renderFrameShowcase() {
  const showcase = document.getElementById('frameShowcase');
  try {
    const frames = await loadFrames();
    showcase.innerHTML = frames.map(buildFrameCardHtml).join('') || EMPTY_SHOWCASE_HTML;
  } catch (err) {
    showcase.innerHTML = EMPTY_SHOWCASE_HTML;
    showToast(err.message || 'Gagal memuat data.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderNavActions('#navActions');
  setupStartButtons();
  document.getElementById('galleryMoreBtn').addEventListener('click', loadGalleryPage);
  loadGalleryPage();
  renderFrameShowcase();
});