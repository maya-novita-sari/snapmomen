// Admin panels for result photos (auto delete after 3 days) and the public web gallery.

const PHOTO_PAGE_SIZE = 12;
const GALLERY_SAVE_LABEL = 'Simpan';
const GALLERY_SAVING_LABEL = 'Menyimpan...';
const GALLERY_PROCESSING_LABEL = 'Memproses gambar...';

const PHOTO_LISTS = {
  hasil: {
    gridId: 'photosGrid',
    moreButtonId: 'photosMoreBtn',
    emptyText: 'Belum ada foto.',
    buildCardHtml: buildResultPhotoCardHtml,
  },
  galeri: {
    gridId: 'galleryAdminGrid',
    moreButtonId: 'galleryAdminMoreBtn',
    emptyText: 'Belum ada foto di galeri.',
    buildCardHtml: buildGalleryPhotoCardHtml,
  },
};

const photoListOffsets = { hasil: 0, galeri: 0 };
let isSavingGalleryPhoto = false;
let galleryImageTask = Promise.resolve(null);

function setupPhotoPanels() {
  Object.keys(PHOTO_LISTS).forEach((listType) => {
    const list = PHOTO_LISTS[listType];
    document.getElementById(list.gridId).addEventListener('click', handlePhotoGridClick);
    document.getElementById(list.moreButtonId).addEventListener('click', () => loadPhotoList(listType));
  });
  setupGalleryModal();
  setupVideoModal();
}

// ---------- Paginated lists ----------

function buildPhotoImageHtml(photo) {
  return `<img src="${photo.thumb_data}" alt="Foto ${escapeHtml(photo.username || '')}" loading="lazy" decoding="async">`;
}

function buildPhotoThumbHtml(photo) {
  if (!photo.has_video) return buildPhotoImageHtml(photo);
  const playButton = `<button type="button" class="play-btn" title="Putar video" aria-label="Putar video"
    data-photo-action="play" data-photo-id="${photo.id}">${iconSvg('play')}</button>`;
  return `<div class="photo-thumb-wrapper">${buildPhotoImageHtml(photo)}${playButton}</div>`;
}

function buildPlayActionHtml(photo) {
  if (!photo.has_video) return '';
  return buildPhotoActionButtonHtml(photo, 'play', 'play', 'Putar video', 'play');
}

function buildPhotoActionButtonHtml(photo, action, icon, label, variant) {
  return buildIconButtonHtml({
    icon, label, variant, attributes: `data-photo-action="${action}" data-photo-id="${photo.id}"`,
  });
}

function buildResultPhotoCardHtml(photo) {
  return `
    <div class="photo-card">
      ${buildPhotoThumbHtml(photo)}
      <div class="pc-meta">${escapeHtml(photo.username || 'Guest')}</div>
      <div class="pc-meta">Hapus otomatis: ${formatIndonesianDate(photo.expires_at)}</div>
      <div class="photo-actions">
        ${buildPhotoActionButtonHtml(photo, 'save-device', 'download', 'Simpan ke Device', 'outline')}
        ${buildPhotoActionButtonHtml(photo, 'print', 'print', 'Print', 'print')}
        ${buildPlayActionHtml(photo)}
        ${buildPhotoActionButtonHtml(photo, 'add-gallery', 'plus', 'Tambah ke Galeri', 'primary')}
        ${buildPhotoActionButtonHtml(photo, 'delete', 'trash', 'Hapus', 'danger')}
      </div>
    </div>`;
}

function buildGalleryPhotoCardHtml(photo) {
  const caption = photo.caption ? escapeHtml(photo.caption) : 'Tanpa keterangan';
  return `
    <div class="photo-card" data-caption="${escapeHtml(photo.caption || '')}">
      ${buildPhotoImageHtml(photo)}
      <div class="pc-meta">${caption}</div>
      <div class="photo-actions">
        ${buildPhotoActionButtonHtml(photo, 'edit', 'pen', 'Edit', 'outline')}
        ${buildPhotoActionButtonHtml(photo, 'delete', 'trash', 'Hapus', 'danger')}
      </div>
    </div>`;
}

async function loadPhotoList(listType, { reset = false } = {}) {
  const list = PHOTO_LISTS[listType];
  const grid = document.getElementById(list.gridId);
  const moreButton = document.getElementById(list.moreButtonId);
  if (reset) photoListOffsets[listType] = 0;
  moreButton.disabled = true;

  try {
    const { photos, has_more: hasMore } = await apiRequest(
      `/photos?type=${listType}&limit=${PHOTO_PAGE_SIZE}&offset=${photoListOffsets[listType]}`,
    );
    if (photoListOffsets[listType] === 0) grid.innerHTML = '';
    grid.insertAdjacentHTML('beforeend', photos.map(list.buildCardHtml).join(''));
    photoListOffsets[listType] += photos.length;
    if (!grid.children.length) grid.innerHTML = `<p style="opacity:.6">${list.emptyText}</p>`;
    moreButton.style.display = hasMore ? 'inline-flex' : 'none';
  } catch (err) {
    showToast(err.message || 'Gagal memuat foto.');
  } finally {
    moreButton.disabled = false;
  }
}

// ---------- Actions on a photo ----------

function handlePhotoGridClick(event) {
  const button = event.target.closest('button[data-photo-action]');
  if (!button) return;

  const photoId = Number(button.dataset.photoId);
  const actions = {
    'save-device': () => saveAdminPhotoToDevice(photoId, button),
    print: () => printAdminPhoto(photoId, button),
    play: () => playPhotoVideo(photoId, button),
    'add-gallery': () => addPhotoToGallery(photoId),
    edit: () => openGalleryModal(button.closest('.photo-card'), photoId),
    delete: () => deletePhoto(photoId),
  };
  actions[button.dataset.photoAction]?.();
}

function getDataUrlExtension(dataUrl) {
  return dataUrl.startsWith('data:video/mp4') ? 'mp4' : 'webm';
}

function waitMilliseconds(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function dataUrlToObjectUrl(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return URL.createObjectURL(blob);
}

function downloadObjectUrl(objectUrl, fileName) {
  downloadDataUrl(objectUrl, fileName);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

// Foto punya video: download dua file (foto lalu video). Tanpa video: satu file foto.
// Semua data disiapkan dulu supaya dua download terjadi berurutan dalam satu klik.
async function saveAdminPhotoToDevice(photoId, button) {
  button.disabled = true;
  try {
    const { photo } = await apiRequest(`/photos?id=${photoId}`);
    const hasVideo = Boolean(photo.has_video && photo.video_data);
    const photoUrl = await dataUrlToObjectUrl(photo.image_data);
    const videoUrl = hasVideo ? await dataUrlToObjectUrl(photo.video_data) : null;
    const baseName = `snapmomen-${Date.now()}`;

    downloadObjectUrl(photoUrl, `${baseName}.jpg`);
    if (videoUrl) {
      await waitMilliseconds(150);
      downloadObjectUrl(videoUrl, `${baseName}.${getDataUrlExtension(photo.video_data)}`);
    }
    showToast(hasVideo ? 'Foto dan video disimpan ke perangkat.' : 'Foto disimpan ke perangkat. Foto ini tidak punya video.');
  } catch (err) {
    showToast(err.message || 'Gagal mengunduh foto.');
  } finally {
    button.disabled = false;
  }
}

// ---------- Video modal ----------

function setupVideoModal() {
  document.getElementById('closeVideoBtn').addEventListener('click', closeVideoModal);
}

function closeVideoModal() {
  const player = document.getElementById('videoPlayer');
  player.pause();
  player.removeAttribute('src');
  player.load();
  closeModal('videoModal');
}

async function playPhotoVideo(photoId, button) {
  button.disabled = true;
  try {
    const { photo } = await apiRequest(`/photos?id=${photoId}`);
    if (!photo.video_data) throw new Error('Video tidak ditemukan.');
    const player = document.getElementById('videoPlayer');
    player.src = photo.video_data;
    openModal('videoModal');
    await player.play().catch(() => {});
  } catch (err) {
    showToast(err.message || 'Gagal memuat video.');
  } finally {
    button.disabled = false;
  }
}

// Print memakai jalur yang sama dengan studio: USB langsung, atau dialog cetak browser.
async function printAdminPhoto(photoId, button) {
  button.disabled = true;
  try {
    const { photo } = await apiRequest(`/photos?id=${photoId}`);
    await printPhoto(photo.image_data);
  } catch (err) {
    showToast(err.message || 'Gagal mencetak foto.');
  } finally {
    button.disabled = false;
  }
}

async function addPhotoToGallery(photoId) {
  try {
    await apiRequest(`/photos?id=${photoId}`, { method: 'PATCH', body: { is_galeri: true, is_hasil: false } });
    showToast('Foto ditambahkan ke galeri.');
    await Promise.all([loadPhotoList('hasil', { reset: true }), loadPhotoList('galeri', { reset: true })]);
  } catch (err) {
    showToast(err.message || 'Gagal menambahkan ke galeri.');
  }
}

async function deletePhoto(photoId) {
  if (!confirm('Hapus foto ini?')) return;
  try {
    await apiRequest(`/photos?id=${photoId}`, { method: 'DELETE' });
    showToast('Foto dihapus.');
    await Promise.all([loadPhotoList('hasil', { reset: true }), loadPhotoList('galeri', { reset: true }), loadStats()]);
  } catch (err) {
    showToast(err.message || 'Gagal menghapus foto.');
  }
}

// ---------- Gallery modal (add and edit) ----------

function setupGalleryModal() {
  document.getElementById('addGalleryBtn').addEventListener('click', () => openGalleryModal(null, null));
  document.getElementById('galleryForm').addEventListener('submit', handleGallerySubmit);
  document.getElementById('galleryImageInput').addEventListener('change', handleGalleryImageChange);
  document.getElementById('closeGalleryBtn').addEventListener('click', () => {
    if (!isSavingGalleryPhoto) closeModal('galleryModal');
  });
}

function setGallerySaveButton(label, isDisabled) {
  setButtonState('gallerySaveBtn', label, isDisabled);
}

function showGalleryPreview(source) {
  const preview = document.getElementById('galleryImagePreview');
  preview.src = source || '';
  preview.style.display = source ? 'block' : 'none';
}

function openGalleryModal(card, photoId) {
  const form = document.getElementById('galleryForm');
  form.reset();
  form.dataset.photoId = photoId || '';
  galleryImageTask = Promise.resolve(null);

  document.getElementById('galleryModalTitle').textContent = photoId ? 'Edit Foto Galeri' : 'Tambah Foto Galeri';
  document.getElementById('galleryCaptionInput').value = card?.dataset.caption || '';
  showGalleryPreview(card?.querySelector('img')?.src);
  setGallerySaveButton(GALLERY_SAVE_LABEL, false);
  openModal('galleryModal');
}

async function handleGalleryImageChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  setGallerySaveButton(GALLERY_PROCESSING_LABEL, true);
  galleryImageTask = compressImageFileForUpload(file);
  try {
    showGalleryPreview(await galleryImageTask);
  } catch (err) {
    galleryImageTask = Promise.resolve(null);
    event.target.value = '';
    showToast(err.message || 'Gagal memproses gambar.');
  } finally {
    setGallerySaveButton(GALLERY_SAVE_LABEL, false);
  }
}

async function buildGalleryPayload(photoId) {
  const imageData = await galleryImageTask;
  const caption = document.getElementById('galleryCaptionInput').value.trim();
  if (!photoId && !imageData) throw new Error('Pilih foto terlebih dahulu.');

  const payload = { caption };
  if (imageData) {
    payload.image_data = imageData;
    payload.thumb_data = await createThumbnailDataUrl(imageData);
  }
  return payload;
}

async function submitGalleryPhoto(photoId, payload) {
  if (photoId) {
    await apiRequest(`/photos?id=${photoId}`, { method: 'PATCH', body: payload, timeoutMs: 30000 });
    return 'Foto galeri diperbarui.';
  }
  await apiRequest('/photos', { method: 'POST', body: { ...payload, is_galeri: true }, timeoutMs: 30000 });
  return 'Foto ditambahkan ke galeri.';
}

async function handleGallerySubmit(event) {
  event.preventDefault();
  if (isSavingGalleryPhoto) return;

  const photoId = event.currentTarget.dataset.photoId;
  isSavingGalleryPhoto = true;
  setGallerySaveButton(GALLERY_SAVING_LABEL, true);

  try {
    const payload = await buildGalleryPayload(photoId);
    const message = await submitGalleryPhoto(photoId, payload);
    closeModal('galleryModal');
    showToast(message);
    await loadPhotoList('galeri', { reset: true });
  } catch (err) {
    showToast(err.message || 'Gagal menyimpan foto galeri.');
  } finally {
    isSavingGalleryPhoto = false;
    setGallerySaveButton(GALLERY_SAVE_LABEL, false);
  }
}