/* Foto de perfil: visualização ampliada e recorte (Cropper.js). Telas: partials/avatar-preview-modal.html e partials/avatar-crop-modal.html */

let cropper = null;

let selectedImageFile = null;

// ==================== FOTO DE PERFIL & CROPPER ====================
async function openAvatarPreview(imgSrc) {
  if (!(await ensureView('avatar-preview-modal'))) return;
  document.getElementById('modalFullImage').src = imgSrc;
  document.getElementById('avatarPreviewModal').classList.remove('hidden');
}

function closeAvatarPreview() {
  document.getElementById('avatarPreviewModal').classList.add('hidden');
}

async function openAvatarCropModal() {
  if (!(await ensureView('avatar-crop-modal'))) return;
  document.getElementById('avatarCropModal').classList.remove('hidden');
  document.getElementById('dropArea').classList.remove('hidden');
  document.getElementById('cropperContainer').classList.add('hidden');
  
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  setupDragAndDrop();
}

function closeAvatarCropModal() {
  document.getElementById('avatarCropModal').classList.add('hidden');
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

function setupDragAndDrop() {
  const dropArea = document.getElementById('dropArea');
  if (!dropArea) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('border-brand', 'bg-brand/5'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('border-brand', 'bg-brand/5'), false);
  });

  dropArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function handleDrop(e) {
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    processImageFile(files[0]);
  }
}

function handleImageSelected(event) {
  const file = event.target.files[0];
  if (file) {
    processImageFile(file);
  }
}

function processImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Por favor, selecione um arquivo de imagem válido.');
    return;
  }

  selectedImageFile = file;
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const imageElement = document.getElementById('imageToCrop');
    imageElement.src = e.target.result;

    document.getElementById('dropArea').classList.add('hidden');
    document.getElementById('cropperContainer').classList.remove('hidden');

    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(imageElement, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.8,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
    });
  };
  
  reader.readAsDataURL(file);
}

async function cropAndUploadAvatar() {
  if (!cropper || !currentUser || !currentUser.id) return;

  const canvas = cropper.getCroppedCanvas({
    width: 300,
    height: 300,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });

  canvas.toBlob(async (blob) => {
    if (!blob) {
      showToast('Erro ao processar o recorte da imagem.');
      return;
    }

    const formData = new FormData();
    const croppedFile = new File([blob], selectedImageFile?.name || 'avatar.jpg', { type: 'image/jpeg' });
    formData.append('avatar', croppedFile);
    formData.append('userId', currentUser.id);

    try {
      showToast('Enviando foto recortada...');
      const response = await fetch(`${API_BASE_URL}/users/avatar`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar foto.');

      const cleanUrl = sanitizeGoogleAvatarUrl(data.url);
      currentProfileData.avatar_url = cleanUrl;
      document.getElementById('sidebarAvatarImg').src = cleanUrl;
      
      currentUser.profile.avatar_url = cleanUrl;
      localStorage.setItem('agora-user', JSON.stringify(currentUser));
      updateHeaderUserUI();

      closeAvatarCropModal();
      showToast('Foto de perfil recortada e atualizada com sucesso!');
    } catch (err) {
      console.error(err);
      showToast(err.message);
    }
  }, 'image/jpeg', 0.9);
}
