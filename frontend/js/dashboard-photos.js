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
}

// ---------- Paginated lists ----------

function buildPhotoImageHtml(photo) {
  return `<img src="${photo.thumb_data}" alt="Foto ${escapeHtml(photo.username || '')}" loading="lazy" decoding="async">`;
}

function buildResultPhotoCardHtml(photo) {
  return `
    <div class="photo-card">
      ${buildPhotoImageHtml(photo)}
      <div class="pc-meta">${escapeHtml(photo.username || 'Guest')}</div>
      <div class="pc-meta">Hapus otomatis: ${formatIndonesianDate(photo.expires_at)}</div>
      <div class="photo-actions">
        <button class="btn btn-outline btn-sm" data-photo-action="save-device" data-photo-id="${photo.id}">Simpan ke Device</button>
        <button class="btn btn-primary btn-sm" data-photo-action="add-gallery" data-photo-id="${photo.id}">Tambah ke Galeri</button>
        <button class="btn btn-danger btn-sm" data-photo-action="delete" data-photo-id="${photo.id}">Hapus</button>
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
        <button class="btn btn-outline btn-sm" data-photo-action="edit" data-photo-id="${photo.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-photo-action="delete" data-photo-id="${photo.id}">Hapus</button>
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
    'add-gallery': () => addPhotoToGallery(photoId),
    edit: () => openGalleryModal(button.closest('.photo-card'), photoId),
    delete: () => deletePhoto(photoId),
  };
  actions[button.dataset.photoAction]?.();
}

async function saveAdminPhotoToDevice(photoId, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Mengunduh...';
  try {
    const { photo } = await apiRequest(`/photos?id=${photoId}`);
    downloadDataUrl(photo.image_data, `snapmomen-${photoId}.jpg`);
    showToast('Foto disimpan ke perangkat.');
  } catch (err) {
    showToast(err.message || 'Gagal mengunduh foto.');
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
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