/**
 * Premium Toast Notification system for ERP TechStore
 */

// Crear el contenedor de toasts si no existe
function getToastContainer() {
  let container = document.getElementById('premium-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'premium-toast-container';
    container.className = 'premium-toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Muestra una notificación toast premium con animación
 * @param {string} title Título de la notificación
 * @param {string} message Mensaje o descripción
 * @param {'success' | 'error' | 'warning'} type Tipo de toast
 */
export function showToast(title, message, type = 'success') {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `premium-toast premium-toast-${type}`;

  const iconClass = type === 'success' ? 'ti-circle-check' : type === 'error' ? 'ti-circle-x' : 'ti-alert-circle';
  
  toast.innerHTML = `
    <div class="premium-toast-icon">
      <i class="ti ${iconClass}" style="font-size: 1.5rem;"></i>
    </div>
    <div class="premium-toast-content">
      <div class="premium-toast-title">${title}</div>
      <div class="premium-toast-msg">${message}</div>
    </div>
  `;

  container.appendChild(toast);

  // Forzar reflow para activar la animación de entrada
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Auto-eliminar después de 3.5 segundos (3s visible + 0.5s animación)
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3500);
}

/**
 * Muestra un diálogo de confirmación premium animado que retorna una promesa
 * @param {string} title Título del diálogo
 * @param {string} message Mensaje o descripción
 * @returns {Promise<boolean>}
 */
export function showConfirm(title, message) {
  return new Promise((resolve) => {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'premium-confirm-overlay';
    modalDiv.innerHTML = `
      <div class="premium-confirm-card">
        <div class="premium-confirm-icon">
          <i class="ti ti-alert-circle" style="font-size: 2rem;"></i>
        </div>
        <div class="premium-confirm-content text-center mb-4">
          <div class="premium-confirm-title mb-1">${title}</div>
          <div class="premium-confirm-msg">${message}</div>
        </div>
        <div class="premium-confirm-actions d-flex justify-content-end w-100">
          <button id="btn-confirm-cancel" class="btn btn-link link-secondary me-2">Cancelar</button>
          <button id="btn-confirm-accept" class="btn btn-danger px-4">Confirmar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalDiv);

    // Animación de entrada
    setTimeout(() => {
      modalDiv.classList.add('show');
    }, 10);

    const closeConfirm = (result) => {
      modalDiv.classList.remove('show');
      modalDiv.classList.add('hide');
      setTimeout(() => {
        modalDiv.remove();
        resolve(result);
      }, 300);
    };

    modalDiv.querySelector('#btn-confirm-accept').addEventListener('click', () => closeConfirm(true));
    modalDiv.querySelector('#btn-confirm-cancel').addEventListener('click', () => closeConfirm(false));
    
    // Click en el overlay (fuera del modal) cancela
    modalDiv.addEventListener('click', (e) => {
      if (e.target === modalDiv) {
        closeConfirm(false);
      }
    });
  });
}

