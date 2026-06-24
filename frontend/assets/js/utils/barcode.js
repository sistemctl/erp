// Barcode reader utility (USB HID keyboard emulation)

let buffer = '';
let lastKeyTime = 0;
let onScanCallback = null;

export function initBarcodeScanner(callback) {
  onScanCallback = callback;
  
  window.addEventListener('keydown', handleKeyDown);
}

export function destroyBarcodeScanner() {
  window.removeEventListener('keydown', handleKeyDown);
  buffer = '';
  onScanCallback = null;
}

function handleKeyDown(e) {
  // Ignorar eventos si provienen de un input enfocado (a menos que queramos específicamente)
  // Aunque algunos escáneres escriben en el input activo, en un ERP de alta gama
  // a menudo se interceptan lecturas globales para agregar al carrito sin importar el foco.
  
  const currentTime = Date.now();
  const diff = currentTime - lastKeyTime;
  lastKeyTime = currentTime;

  // Los lectores USB HID escriben extremadamente rápido (típicamente < 30ms entre teclas)
  if (diff > 50) {
    // Si la diferencia es mayor, se asume entrada manual por teclado físico del usuario
    buffer = '';
  }

  // Si la tecla es Enter, procesar el buffer
  if (e.key === 'Enter') {
    if (buffer.length >= 3) {
      e.preventDefault();
      if (onScanCallback) {
        onScanCallback(buffer);
      }
      buffer = '';
    }
  } else if (e.key.length === 1) {
    buffer += e.key;
  }
}
