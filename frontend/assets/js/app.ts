import { isAuthenticated, getUsuario, logout } from './auth.js';
import { showToast, type ToastType } from './utils/toast.js';
import { applyThemeFromCache, initThemeFromServer } from './utils/theme.js';
import { applyDocumentBranding, getCachedBrand, resolveAssetUrl } from './utils/branding.js';
import { isPublicSeguimientoLocation } from './modules/seguimiento-reparacion.js';
import { quickActionsForRole } from './utils/quick-actions.js';
import type { Role } from '../../../shared/contracts';
import { isModuleRoute, moduleRegistry, seguimientoModule, type ModuleRoute } from './utils/module-registry.js';
import { requireElement, requireSelector } from './utils/dom.js';
import { mountMobileUI } from './utils/mobile-ui.js';
import { mountMobileNavigation, revealMobileModule } from './utils/mobile-navigation.js';
interface NavigationLink { name: string; hash: ModuleRoute | '#/auditlog'; icon: string; }
interface ShellConfig { empresa: string; logoUrl?: string | null; }
interface BrandingConfig extends ShellConfig { temaInterfaz?: Record<string, unknown>; }
// Anular global alert del navegador con una notificación Toast Premium animada
window.alert = (message?: unknown) => {
  let type: ToastType = 'info';
  const msgLower = String(message || '').toLowerCase();
  if (msgLower.includes('error') || msgLower.includes('fall') || msgLower.includes('insuficiente') || msgLower.includes('no se') || msgLower.includes('inválid') || msgLower.includes('duplicado') || msgLower.includes('no hay') || msgLower.includes('falta')) {
    type = 'error';
  } else if (msgLower.includes('exitosa') || msgLower.includes('éxito') || msgLower.includes('correcta') || msgLower.includes('creado') || msgLower.includes('eliminado') || msgLower.includes('guardado') || msgLower.includes('actualizad') || msgLower.includes('restaurada') || msgLower.includes('bien') || msgLower.includes('completad')) {
    type = 'success';
  } else if (msgLower.includes('atención') || msgLower.includes('advertencia') || msgLower.includes('cuidado') || msgLower.includes('requerid') || msgLower.includes('seguro')) {
    type = 'warning';
  }
  
  const title = type === 'success' ? 'Éxito' : type === 'error' ? 'Error' : 'Aviso';
  showToast(title, message, type);
};


const SIDEBAR_SECTIONS = [
  {
    id: 'inicio',
    label: 'Inicio',
    hashes: ['#/dashboard']
  },
  {
    id: 'comercial',
    label: 'Comercial',
    hashes: ['#/pos', '#/ventas', '#/cotizaciones', '#/clientes', '#/tradein']
  },
  {
    id: 'servicio',
    label: 'Servicio técnico',
    hashes: ['#/reparaciones', '#/rma', '#/instalaciones']
  },
  {
    id: 'inventario',
    label: 'Inventario',
    hashes: ['#/inventario', '#/series']
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    hashes: ['#/caja', '#/facturacion', '#/cartera', '#/compras', '#/proveedores', '#/nomina', '#/rentabilidad', '#/reportes']
  },
  {
    id: 'sistema',
    label: 'Sistema',
    hashes: ['#/config']
  }
];

const modulosPorRol: Record<Role, NavigationLink[]> = {
  superadmin: [
    { name: 'Dashboard', hash: '#/dashboard', icon: 'ti-dashboard' },
    { name: 'Punto de venta', hash: '#/pos', icon: 'ti-shopping-cart' },
    { name: 'Historial Ventas', hash: '#/ventas', icon: 'ti-receipt' },
    { name: 'Clientes CRM', hash: '#/clientes', icon: 'ti-users-group' },
    { name: 'Reparaciones', hash: '#/reparaciones', icon: 'ti-tool' },
    { name: 'Garantía / RMA', hash: '#/rma', icon: 'ti-shield-check' },
    { name: 'Instalaciones', hash: '#/instalaciones', icon: 'ti-home-bolt' },
    { name: 'Rentabilidad', hash: '#/rentabilidad', icon: 'ti-chart-bar' },
    { name: 'Reportes', hash: '#/reportes', icon: 'ti-report-analytics' },
    { name: 'Inventario', hash: '#/inventario', icon: 'ti-package' },
    { name: 'Facturación', hash: '#/facturacion', icon: 'ti-file-text' },
    { name: 'Caja', hash: '#/caja', icon: 'ti-building-store' },
    { name: 'Nómina', hash: '#/nomina', icon: 'ti-users' },
    { name: 'Compras', hash: '#/compras', icon: 'ti-truck' },
    { name: 'Proveedores', hash: '#/proveedores', icon: 'ti-building-factory' },
    { name: 'Cotizaciones', hash: '#/cotizaciones', icon: 'ti-file-invoice' },
    { name: 'Trade-In', hash: '#/tradein', icon: 'ti-refresh' },
    { name: 'Cartera', hash: '#/cartera', icon: 'ti-wallet' },
    { name: 'Configuración', hash: '#/config', icon: 'ti-settings' }
  ],
  admin: [
    { name: 'Dashboard', hash: '#/dashboard', icon: 'ti-dashboard' },
    { name: 'Punto de venta', hash: '#/pos', icon: 'ti-shopping-cart' },
    { name: 'Historial Ventas', hash: '#/ventas', icon: 'ti-receipt' },
    { name: 'Clientes CRM', hash: '#/clientes', icon: 'ti-users-group' },
    { name: 'Reparaciones', hash: '#/reparaciones', icon: 'ti-tool' },
    { name: 'Garantía / RMA', hash: '#/rma', icon: 'ti-shield-check' },
    { name: 'Instalaciones', hash: '#/instalaciones', icon: 'ti-home-bolt' },
    { name: 'Rentabilidad', hash: '#/rentabilidad', icon: 'ti-chart-bar' },
    { name: 'Reportes', hash: '#/reportes', icon: 'ti-report-analytics' },
    { name: 'Inventario', hash: '#/inventario', icon: 'ti-package' },
    { name: 'Facturación', hash: '#/facturacion', icon: 'ti-file-text' },
    { name: 'Caja', hash: '#/caja', icon: 'ti-building-store' },
    { name: 'Nómina', hash: '#/nomina', icon: 'ti-users' },
    { name: 'Compras', hash: '#/compras', icon: 'ti-truck' },
    { name: 'Proveedores', hash: '#/proveedores', icon: 'ti-building-factory' },
    { name: 'Cotizaciones', hash: '#/cotizaciones', icon: 'ti-file-invoice' },
    { name: 'Trade-In', hash: '#/tradein', icon: 'ti-refresh' },
    { name: 'Cartera', hash: '#/cartera', icon: 'ti-wallet' }
  ],
  gerente_sede: [
    { name: 'Dashboard', hash: '#/dashboard', icon: 'ti-dashboard' },
    { name: 'Punto de venta', hash: '#/pos', icon: 'ti-shopping-cart' },
    { name: 'Historial Ventas', hash: '#/ventas', icon: 'ti-receipt' },
    { name: 'Clientes CRM', hash: '#/clientes', icon: 'ti-users-group' },
    { name: 'Reparaciones', hash: '#/reparaciones', icon: 'ti-tool' },
    { name: 'Garantía / RMA', hash: '#/rma', icon: 'ti-shield-check' },
    { name: 'Instalaciones', hash: '#/instalaciones', icon: 'ti-home-bolt' },
    { name: 'Rentabilidad', hash: '#/rentabilidad', icon: 'ti-chart-bar' },
    { name: 'Reportes', hash: '#/reportes', icon: 'ti-report-analytics' },
    { name: 'Inventario', hash: '#/inventario', icon: 'ti-package' },
    { name: 'Facturación', hash: '#/facturacion', icon: 'ti-file-text' },
    { name: 'Caja', hash: '#/caja', icon: 'ti-building-store' },
    { name: 'Compras', hash: '#/compras', icon: 'ti-truck' },
    { name: 'Proveedores', hash: '#/proveedores', icon: 'ti-building-factory' },
    { name: 'Cotizaciones', hash: '#/cotizaciones', icon: 'ti-file-invoice' },
    { name: 'Trade-In', hash: '#/tradein', icon: 'ti-refresh' },
    { name: 'Cartera', hash: '#/cartera', icon: 'ti-wallet' }
  ],
  cajero: [
    { name: 'Punto de venta', hash: '#/pos', icon: 'ti-shopping-cart' },
    { name: 'Historial Ventas', hash: '#/ventas', icon: 'ti-receipt' },
    { name: 'Clientes CRM', hash: '#/clientes', icon: 'ti-users-group' },
    { name: 'Facturación', hash: '#/facturacion', icon: 'ti-file-text' },
    { name: 'Caja', hash: '#/caja', icon: 'ti-building-store' },
    { name: 'Cartera', hash: '#/cartera', icon: 'ti-wallet' },
    { name: 'Garantía / RMA', hash: '#/rma', icon: 'ti-shield-check' },
    { name: 'Inventario (Ver)', hash: '#/inventario', icon: 'ti-package' }
  ],
  tecnico: [
    { name: 'Reparaciones', hash: '#/reparaciones', icon: 'ti-tool' },
    { name: 'Garantía / RMA', hash: '#/rma', icon: 'ti-shield-check' },
    { name: 'Instalaciones', hash: '#/instalaciones', icon: 'ti-home-bolt' }
  ],
  contador: [
    { name: 'Dashboard', hash: '#/dashboard', icon: 'ti-dashboard' },
    { name: 'Historial Ventas', hash: '#/ventas', icon: 'ti-receipt' },
    { name: 'Facturación', hash: '#/facturacion', icon: 'ti-file-text' },
    { name: 'Nómina', hash: '#/nomina', icon: 'ti-users' },
    { name: 'Compras', hash: '#/compras', icon: 'ti-truck' },
    { name: 'Proveedores', hash: '#/proveedores', icon: 'ti-building-factory' },
    { name: 'Caja', hash: '#/caja', icon: 'ti-building-store' },
    { name: 'Rentabilidad', hash: '#/rentabilidad', icon: 'ti-chart-bar' },
    { name: 'Reportes', hash: '#/reportes', icon: 'ti-report-analytics' }
  ]
};

function buildSidebarMenuHtml(modulos: readonly NavigationLink[]): string {
  const byHash = new Map(modulos.map((m) => [m.hash.split('?')[0], m]));
  const used = new Set();
  const parts = [];

  const renderItem = (m: NavigationLink) => `
    <li class="nav-item">
      <a class="nav-link" href="${m.hash}" data-hash="${m.hash}">
        <span class="nav-link-icon d-md-none d-lg-inline-block">
          <i class="ti ${m.icon} fs-2"></i>
        </span>
        <span class="nav-link-title">${m.name}</span>
      </a>
    </li>
  `;

  for (const section of SIDEBAR_SECTIONS) {
    const items = section.hashes
      .map((h) => byHash.get(h))
      .filter((item): item is NavigationLink => item !== undefined);
    if (!items.length) continue;
    parts.push(`<li class="nav-item nav-section" aria-hidden="true"><span class="nav-section-label">${section.label}</span></li>`);
    for (const m of items) {
      used.add(m.hash.split('?')[0]);
      parts.push(renderItem(m));
    }
  }

  for (const m of modulos) {
    const base = m.hash.split('?')[0];
    if (used.has(base)) continue;
    parts.push(renderItem(m));
  }

  return parts.join('');
}

function buildMobileNavigation(modulos: readonly NavigationLink[]): string {
  const preferred: NavigationLink['hash'][] = ['#/pos', '#/caja', '#/inventario', '#/dashboard'];
  const selected = preferred.map(hash => modulos.find(module => module.hash === hash))
    .filter((module): module is NavigationLink => module !== undefined);
  for (const module of modulos) {
    if (!selected.some(item => item.hash === module.hash)) selected.push(module);
  }
  const labels: Partial<Record<NavigationLink['hash'], string>> = {
    '#/pos': 'Vender', '#/inventario': 'Inventario', '#/dashboard': 'Inicio',
    '#/reparaciones': 'Taller', '#/instalaciones': 'Instalar', '#/rma': 'Garantía', '#/ventas': 'Ventas',
    '#/clientes': 'Clientes', '#/facturacion': 'Facturas', '#/cotizaciones': 'Cotizar',
    '#/proveedores': 'Proveedores', '#/config': 'Ajustes'
  };
  return `<nav class="erp-mobile-nav d-print-none" aria-label="Navegación principal móvil">
    <button type="button" class="erp-mobile-nav-arrow" data-nav-direction="-1" aria-label="Módulos anteriores" aria-controls="mobile-nav-rail" disabled><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
    <div id="mobile-nav-rail" class="erp-mobile-nav-rail" role="group" aria-label="Módulos disponibles; desliza para ver más">
    ${selected.map(module => `<a href="${module.hash}" data-hash="${module.hash}" class="erp-mobile-nav-item" aria-label="${module.name}" title="${module.name}">
      <i class="ti ${module.icon}" aria-hidden="true"></i><span>${labels[module.hash] || module.name}</span>
    </a>`).join('')}
    </div>
    <button type="button" class="erp-mobile-nav-arrow" data-nav-direction="1" aria-label="Módulos siguientes" aria-controls="mobile-nav-rail"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
    <button type="button" id="mobile-more-btn" class="erp-mobile-nav-item" data-bs-toggle="modal" data-bs-target="#mobile-modules-modal" aria-label="Ver todos los módulos">
      <i class="ti ti-layout-grid" aria-hidden="true"></i><span>Más</span>
    </button>
  </nav>
  <div class="modal fade" id="mobile-modules-modal" tabindex="-1" aria-labelledby="mobile-modules-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-scrollable erp-mobile-modules-dialog"><div class="modal-content">
      <div class="modal-header"><h2 class="modal-title" id="mobile-modules-title">Tus módulos</h2>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar módulos"></button>
      </div>
      <div class="modal-body">
        <label class="form-label" for="mobile-module-search">Buscar módulo</label>
        <input id="mobile-module-search" type="search" class="form-control mb-3" placeholder="Nombre del módulo…" autocomplete="off">
        <p id="mobile-module-empty" class="text-secondary" role="status" hidden>No hay módulos con ese nombre.</p>
        <ul class="erp-mobile-module-list">${buildSidebarMenuHtml(modulos)}</ul>
      </div>
    </div></div>
  </div>`;
}

const ROL_META = {
  superadmin: { label: 'Superadmin', tone: 'violet' },
  admin: { label: 'Administrador', tone: 'blue' },
  gerente_sede: { label: 'Gerente de sede', tone: 'cyan' },
  cajero: { label: 'Cajero', tone: 'green' },
  tecnico: { label: 'Técnico', tone: 'amber' },
  contador: { label: 'Contador', tone: 'slate' },
};

function getInitials(nombre: string | undefined): string {
  return (nombre || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function getModuleLabel(rawHash: string, rol: Role): string {
  const hash = (rawHash || '#/dashboard').split('?')[0] || '#/dashboard';
  const params = new URLSearchParams((rawHash || '').split('?')[1] || '');
  if (hash === '#/config' && params.get('tab') === 'auditoria') return 'Auditoría';
  const modulos = modulosPorRol[rol] || [];
  const match = modulos.find((m) => {
    const base = m.hash.split('?')[0];
    return m.hash === rawHash || base === hash;
  });
  if (match) return match.name;
  const labels: Record<string, string> = {
    '#/config': 'Configuración',
    '#/series': 'Series / IMEI',
    '#/dashboard': 'Dashboard',
  };
  return labels[hash] || 'Inicio';
}

/** True si el rol puede abrir esa ruta (menú o rutas satélite permitidas). */
function canAccessModule(rol: Role, hash: string): boolean {
  const base = (hash || '').split('?')[0] || '#/dashboard';
  const modulos = modulosPorRol[rol] || [];
  if (modulos.some((m) => m.hash.split('?')[0] === base)) return true;
  // Series/IMEI: quien ve inventario
  if (base === '#/series' && modulos.some((m) => m.hash.split('?')[0] === '#/inventario')) return true;
  // Auditoría vive bajo Configuración
  if (base === '#/auditlog' && modulos.some((m) => m.hash.split('?')[0] === '#/config')) return true;
  return false;
}

function updateTopbarContext(rawHash: string): void {
  const usuario = getUsuario();
  if (!usuario) return;
  const titleEl = document.getElementById('topbar-module-title');
  const kickerEl = document.getElementById('topbar-module-kicker');
  if (!titleEl) return;
  const hash = (rawHash || '#/dashboard').split('?')[0] || '#/dashboard';
  const label = getModuleLabel(rawHash, usuario.rol);
  titleEl.textContent = label;
  if (kickerEl) {
    kickerEl.textContent = hash === '#/dashboard' ? 'Panel principal' : 'Módulo activo';
  }
}

// Router principal
let routerRunning = false;
let routerPending = false;
let activeMobileCleanup: (() => void) | null = null;
let mobileNavigationCleanup: (() => void) | null = null;
const closingDialogs = new Map<HTMLElement, Promise<void>>();
document.addEventListener('hide.bs.modal', event => {
  if (!(event.target instanceof HTMLElement) || closingDialogs.has(event.target)) return;
  const modal = event.target;
  closingDialogs.set(modal, new Promise(resolve => modal.addEventListener('hidden.bs.modal', () => {
    closingDialogs.delete(modal); resolve();
  }, { once: true })));
});
async function router() {
  routerPending = true;
  if (routerRunning) return;
  routerRunning = true;
  const quickActionsButton = document.getElementById('btn-quick-actions');
  if (quickActionsButton instanceof HTMLButtonElement) quickActionsButton.disabled = true;
  try {
    // Los módulos usan elementos del documento: no pueden montarse simultáneamente.
    // Los cambios intermedios se agrupan y la siguiente carga lee la última ruta.
    while (routerPending) {
      routerPending = false;
      await renderRoute();
    }
  } finally {
    routerRunning = false;
    const quickActionsButton = document.getElementById('btn-quick-actions');
    if (quickActionsButton instanceof HTMLButtonElement) quickActionsButton.disabled = false;
  }
}

async function renderRoute() {
  await Promise.all([...closingDialogs.values()]);
  // Cerrar Bootstrap antes de retirar sus nodos evita fondos y focos huérfanos.
  await Promise.all(Array.from(document.querySelectorAll<HTMLElement>('.modal.show')).map(modal => new Promise<void>(resolve => {
    const instance = bootstrap.Modal.getInstance(modal);
    if (!instance) { resolve(); return; }
    let timer: ReturnType<typeof setTimeout>;
    const finished = () => { clearTimeout(timer); modal.removeEventListener('hidden.bs.modal', finished); modal.removeEventListener('shown.bs.modal', hide); resolve(); };
    const hide = () => instance.hide();
    modal.addEventListener('hidden.bs.modal', finished, { once: true });
    modal.addEventListener('shown.bs.modal', hide, { once: true });
    timer = setTimeout(() => { instance.hide(); finished(); }, 1000);
    instance.hide();
  })));
  await Promise.all([...closingDialogs.values()]);
  activeMobileCleanup?.();
  activeMobileCleanup = null;
  const rawHash = window.location.hash || '#/dashboard';
  const hash = rawHash.split('?')[0] || '#/dashboard';
  const appContainer = requireElement('app', HTMLElement);

  // Seguimiento público (QR del cliente) — sin login ni shell del ERP
  // Soporta /r/OR-xxx, /seguimiento/OR-xxx y #/seguimiento/OR-xxx
  if (isPublicSeguimientoLocation(rawHash)) {
    mobileNavigationCleanup?.(); mobileNavigationCleanup = null;
    if (window.activeModuleCleanup) {
      window.activeModuleCleanup();
      window.activeModuleCleanup = null;
    }
    const { init } = await seguimientoModule.load();
    await init(appContainer, rawHash);
    activeMobileCleanup = mountMobileUI(appContainer, '#/seguimiento');
    return;
  }

  // Etiquetas QR antiguas: #/reparaciones?buscar=OR-xxx → seguimiento público si no hay sesión
  if (!isAuthenticated() && hash === '#/reparaciones') {
    const params = new URLSearchParams(rawHash.includes('?') ? rawHash.split('?')[1] : '');
    const buscar = (params.get('buscar') || '').trim();
    if (buscar) {
      // Usar ruta estable (sin #) para que un refresh/reescaneo no pierda el fragmento
      window.location.replace(`${window.location.origin}/r/${encodeURIComponent(buscar)}`);
      return;
    }
  }

  // 1. Verificar si está logueado
  if (!isAuthenticated()) {
    await renderLoginView(appContainer);
    return;
  }

  // Verificar que los datos del usuario sean válidos (no null/corruptos)
  const usuarioActual = getUsuario();
  if (!usuarioActual || !usuarioActual.rol) {
    // Token existe pero datos de usuario son inválidos — limpiar y mostrar login
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    await renderLoginView(appContainer);
    return;
  }

  // Si está logueado pero está en #/login, redirigir al primer módulo disponible
  if (hash === '#/login') {
    const modulos = modulosPorRol[usuarioActual.rol] || [];
    window.location.hash = modulos[0] ? modulos[0].hash : '#/dashboard';
    return;
  }

  // Bloquear deep-links a módulos fuera del rol (p. ej. cajero → #/instalaciones)
  if (!canAccessModule(usuarioActual.rol, hash)) {
    const modulos = modulosPorRol[usuarioActual.rol] || [];
    const fallback = modulos[0]?.hash || '#/dashboard';
    if (rawHash !== fallback) {
      window.location.hash = fallback;
    }
    return;
  }

  // 2. Renderizar contenedor base con Sidebar y Topbar (si no se ha renderizado)
  if (!document.getElementById('sidebar-container')) {
    await renderBaseShell(appContainer);
  }

  // Actualizar el estado del menú activo en el sidebar
  updateActiveMenu(hash);
  updateTopbarContext(rawHash);

  // 3. Renderizar el módulo específico
  const contentContainer = requireElement('main-content', HTMLElement);
  contentContainer.innerHTML = `
    <div class="container-xl text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <div class="mt-2 text-secondary">Cargando módulo…</div>
    </div>
  `;

  // Cleanup anterior (por ejemplo, escáner de barras del POS)
  if (window.activeModuleCleanup) {
    window.activeModuleCleanup();
    window.activeModuleCleanup = null;
  }

  activeMobileCleanup = mountMobileUI(appContainer, hash);

  try {
    if (hash === '#/auditlog') {
      window.location.hash = '#/config?tab=auditoria';
      return;
    }
    if (isModuleRoute(hash)) {
      const lifecycle = await moduleRegistry[hash].load();
      await lifecycle.init(contentContainer, rawHash);
      if (lifecycle.destroy) window.activeModuleCleanup = lifecycle.destroy;
    } else {
      contentContainer.innerHTML = `
        <div class="container-xl py-5">
          <div class="alert alert-info">
            <h4 class="alert-title">Módulo en Desarrollo</h4>
            <div class="text-secondary">El módulo para la ruta <strong>${hash}</strong> se habilitará en la siguiente fase de desarrollo técnico.</div>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error al cargar módulo:', error);
    contentContainer.innerHTML = `
      <div class="container-xl py-5">
        <div class="alert alert-danger">
          <h4 class="alert-title">Error al cargar el módulo</h4>
          <div class="text-secondary">${error instanceof Error ? error.message : String(error)}</div>
          <button type="button" id="retry-module" class="btn btn-primary mt-3">Reintentar</button>
        </div>
      </div>
    `;
    document.getElementById('retry-module')?.addEventListener('click', () => { void router(); });
  }
}

// Vista de Login
async function renderLoginView(container: HTMLElement): Promise<void> {
  mobileNavigationCleanup?.(); mobileNavigationCleanup = null;
  const colorScheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-bs-theme', colorScheme);

  let brand = getCachedBrand();
  try {
    const { apiFetch } = await import('./api.js');
    const { applyTheme, applyThemeFromCache } = await import('./utils/theme.js');
    const remote = await apiFetch<BrandingConfig>('/config/branding');
    brand = applyDocumentBranding({
      empresa: remote?.empresa || brand.empresa,
      logoUrl: remote?.logoUrl || brand.logoUrl
    });
    if (remote?.temaInterfaz && Object.keys(remote.temaInterfaz).length > 0) {
      applyTheme(remote.temaInterfaz);
    } else {
      applyThemeFromCache();
    }
  } catch (_) {
    const { applyThemeFromCache } = await import('./utils/theme.js');
    applyThemeFromCache();
  }

  const logoMarkClass = brand.logoUrl
    ? 'login-panel__logo-mark login-panel__logo-mark--has-img'
    : 'login-panel__logo-mark';
  const logoInner = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.empresa}" class="login-panel__logo-img">`
    : `<i class="ti ti-building-warehouse" aria-hidden="true"></i>`;
  const stageLogo = brand.logoUrl
    ? `<div class="login-panel__stage-brand"><img src="${brand.logoUrl}" alt="" class="login-panel__stage-logo"></div>`
    : '';

  container.className = 'login-page-wrap';
  container.innerHTML = `
    <div class="login-page">
      <div class="login-panel">
        <div class="login-panel__form">
          <header class="login-panel__brand">
            <div class="${logoMarkClass}">
              ${logoInner}
            </div>
            <div class="login-panel__brand-text">
              <div class="login-panel__product">${brand.empresa}</div>
              <div class="login-panel__company">Gestión Integrada · ERP</div>
            </div>
          </header>

          <div class="login-panel__welcome">
            <p class="login-panel__eyebrow">Acceso al sistema</p>
            <h1 class="login-panel__title">Bienvenido</h1>
            <p class="login-panel__subtitle">Ingresa con tu usuario corporativo para continuar.</p>
          </div>

          <div id="login-error" class="login-panel__error d-none" role="alert"></div>

          <form id="login-form" class="login-panel__form-fields" autocomplete="off" novalidate>
            <div class="login-panel__field">
              <label class="login-panel__label" for="login-email">Usuario</label>
              <div class="login-panel__input-wrap">
                <i class="ti ti-user login-panel__input-icon" aria-hidden="true"></i>
                <input type="text" id="login-email" class="login-panel__input" placeholder="correo o nombre de usuario" required autocomplete="username" spellcheck="false">
              </div>
            </div>
            <div class="login-panel__field">
              <label class="login-panel__label" for="login-password">Contraseña</label>
              <div class="login-panel__input-wrap">
                <i class="ti ti-lock login-panel__input-icon" aria-hidden="true"></i>
                <input type="password" id="login-password" class="login-panel__input" placeholder="Tu contraseña" required autocomplete="current-password">
                <button type="button" id="login-password-toggle" class="login-panel__password-toggle" aria-label="Mostrar contraseña" title="Mostrar contraseña" aria-pressed="false">
                  <i class="ti ti-eye" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <button type="submit" id="login-btn" class="login-panel__submit">
              <span>Iniciar sesión</span>
              <i class="ti ti-arrow-right" aria-hidden="true"></i>
            </button>
          </form>

          <footer class="login-panel__footer">Acceso restringido a personal autorizado</footer>
        </div>

        <aside class="login-panel__stage" aria-label="Vista de inventario">
          ${stageLogo}
          <div class="login-panel__stage-bg" aria-hidden="true"></div>
          <div class="login-panel__stage-glow" aria-hidden="true"></div>

          <div class="login-inv" aria-hidden="true">
            <div class="login-inv__badge">
              <span class="login-inv__live-dot"></span>
              Inventario en tiempo real
            </div>

            <div class="login-inv__warehouse">
              <div class="login-inv__rack">
                <div class="login-inv__shelf">
                  ${[1, 2, 3].map((row) => `
                    <div class="login-inv__row">
                      ${[1, 2, 3].map((col) => `
                        <div class="login-inv__slot login-inv__slot--r${row}c${col}">
                          <span class="login-inv__box"></span>
                          <span class="login-inv__qty"></span>
                        </div>
                      `).join('')}
                    </div>
                  `).join('')}
                </div>
                <div class="login-inv__scanner"></div>
                <div class="login-inv__beam"></div>
              </div>

              <div class="login-inv__float login-inv__float--sku">
                <i class="ti ti-barcode"></i>
                <span>SKU escaneado</span>
              </div>
              <div class="login-inv__float login-inv__float--stock">
                <i class="ti ti-package"></i>
                <span>+12 uds</span>
              </div>
              <div class="login-inv__float login-inv__float--imei">
                <i class="ti ti-qrcode"></i>
                <span>IMEI validado</span>
              </div>
            </div>

            <div class="login-inv__ticker" aria-hidden="true">
              <div class="login-inv__ticker-track">
                <span>Entrada de mercancía · Bodega principal</span>
                <span>Traslado confirmado · Sede Centro → Norte</span>
                <span>Alerta stock bajo · Audífonos Pro</span>
                <span>Serie registrada · Control PS5</span>
                <span>Entrada de mercancía · Bodega principal</span>
                <span>Traslado confirmado · Sede Centro → Norte</span>
                <span>Alerta stock bajo · Audífonos Pro</span>
                <span>Serie registrada · Control PS5</span>
              </div>
            </div>
          </div>

          <div class="login-panel__stage-copy">
            <h2 class="login-panel__stage-title">Tu almacén, siempre bajo control</h2>
            <p class="login-panel__stage-text">
              Stock por sede, series e IMEI, movimientos y alertas de mínimo — todo sincronizado mientras operas ventas y taller.
            </p>
          </div>
        </aside>
      </div>
    </div>
  `;

  const form = requireElement('login-form', HTMLFormElement);
  const btn = requireElement('login-btn', HTMLButtonElement);
  const passwordInput = requireElement('login-password', HTMLInputElement);
  const passwordToggle = requireElement('login-password-toggle', HTMLButtonElement);
  const submitDefaultHtml = btn.innerHTML;

  passwordToggle.addEventListener('click', () => {
    const visible = passwordInput.type === 'text';
    passwordInput.type = visible ? 'password' : 'text';
    passwordToggle.setAttribute('aria-pressed', String(!visible));
    passwordToggle.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    passwordToggle.setAttribute('title', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    passwordToggle.innerHTML = `<i class="ti ti-${visible ? 'eye' : 'eye-off'}" aria-hidden="true"></i>`;
    passwordInput.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = requireElement('login-email', HTMLInputElement).value;
    const password = passwordInput.value;
    const errorDiv = requireElement('login-error', HTMLElement);

    errorDiv.classList.add('d-none');
    btn.disabled = true;
    btn.innerHTML = 'Ingresando…';

    try {
      const { login } = await import('./auth.js');
      await login(email, password);
      router();
    } catch (err) {
      errorDiv.textContent = err instanceof Error ? err.message : 'No se pudo conectar. Verifica usuario y contraseña.';
      errorDiv.classList.remove('d-none');
      btn.disabled = false;
      btn.innerHTML = submitDefaultHtml;
    }
  });
  activeMobileCleanup = mountMobileUI(container, '#/login');
}

// Shell base con Sidebar y Topbar
async function renderBaseShell(container: HTMLElement): Promise<void> {
  const usuario = getUsuario();
  if (!usuario) { await renderLoginView(container); return; }
  const modulos = modulosPorRol[usuario.rol] || [];

  let config: ShellConfig = { empresa: 'TechStore Colombia' };
  try {
    const { apiFetch } = await import('./api.js');
    config = await apiFetch<ShellConfig>('/config/sistema') ?? config;
  } catch (err) {
    console.error('Error al obtener la configuración de la empresa:', err);
  }

  if (config?.empresa) {
    config = applyDocumentBranding({
      empresa: config.empresa,
      logoUrl: config.logoUrl
    });
  }

  const logoSrc = resolveAssetUrl(config.logoUrl);
  const rolMeta = ROL_META[usuario.rol] || { label: usuario.rol.replace(/_/g, ' '), tone: 'slate' };
  const userInitials = getInitials(usuario.nombre);
  const currentHash = window.location.hash || '#/dashboard';
  const currentHashBase = currentHash.split('?')[0] || '#/dashboard';
  const initialModule = getModuleLabel(currentHash, usuario.rol);
  const initialKicker = currentHashBase === '#/dashboard' ? 'Panel principal' : 'Módulo activo';
  const palabras = (config.empresa || 'TechStore Colombia').split(' ');
  const primeraPalabra = palabras[0] || 'TechStore';
  const restoNombre = palabras.slice(1).join(' ') || '';

  const logoHtml = `
    <div class="d-flex align-items-center">
      ${logoSrc ? `<img src="${logoSrc}" alt="${config.empresa}" class="me-2 sidebar-logo">` : ''}
      <div>
        <span class="fs-2 fw-bold text-primary">${primeraPalabra}</span> <span class="fs-3 fw-light text-reset">${restoNombre}</span>
      </div>
    </div>
  `;

  container.className = "page";
  const menuItemsHtml = buildSidebarMenuHtml(modulos);

  container.innerHTML = `
    <!-- Sidebar -->
    <aside id="sidebar-container" class="navbar navbar-vertical navbar-expand-lg d-print-none">
      <div class="container-fluid">
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#sidebar-menu" aria-controls="sidebar-menu" aria-expanded="false" aria-label="Abrir menú de navegación">
          <span class="navbar-toggler-icon"></span>
        </button>
        <h1 class="navbar-brand navbar-brand-autodark">
          <a href="#/dashboard" class="text-reset text-decoration-none">
            ${logoHtml}
          </a>
        </h1>
        <div class="collapse navbar-collapse" id="sidebar-menu">
          <ul class="navbar-nav pt-lg-3">
            ${menuItemsHtml}
          </ul>
        </div>
      </div>
    </aside>

    <!-- Topbar & Main Wrapper -->
    <div class="page-wrapper">
      <header class="navbar erp-topbar d-flex d-print-none">
        <div class="container-xl erp-topbar-inner">
          <a class="erp-mobile-brand" href="${modulos[0]?.hash || '#/pos'}" aria-label="${config.empresa}">${logoHtml}</a>
          <div class="erp-topbar-context" aria-live="polite">
            <span class="erp-topbar-accent" aria-hidden="true"></span>
            <div class="erp-topbar-context-text">
              <p class="erp-topbar-kicker" id="topbar-module-kicker">${initialKicker}</p>
              <h2 class="erp-topbar-title" id="topbar-module-title">${initialModule}</h2>
            </div>
          </div>

          <div class="erp-topbar-actions">
            ${quickActionsForRole(usuario.rol).length ? `
              <div class="dropdown erp-quick-actions">
                <button type="button" id="btn-quick-actions" class="btn btn-primary erp-quick-actions-trigger" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Acciones rápidas" title="Acciones rápidas" ${routerRunning ? 'disabled' : ''}>
                  <i class="ti ti-bolt" aria-hidden="true"></i><span class="erp-quick-actions-label">Acciones rápidas</span>
                </button>
                <div class="dropdown-menu dropdown-menu-end erp-quick-actions-menu" aria-labelledby="btn-quick-actions">
                  <div class="dropdown-header">¿Qué quieres hacer?</div>
                  ${quickActionsForRole(usuario.rol).map(action => `<button type="button" class="dropdown-item erp-quick-action" data-quick-action="${action.id}"><i class="ti ${action.icon}" aria-hidden="true"></i><span><strong>${action.label}</strong><small>${action.description}</small></span></button>`).join('')}
                </div>
              </div>` : ''}
            <div class="erp-theme-switch" role="group" aria-label="Tema de la interfaz">
              <button type="button" class="erp-theme-btn" data-theme="light" title="Modo claro" aria-label="Activar modo claro">
                <i class="ti ti-sun" aria-hidden="true"></i>
              </button>
              <button type="button" class="erp-theme-btn" data-theme="dark" title="Modo oscuro" aria-label="Activar modo oscuro">
                <i class="ti ti-moon" aria-hidden="true"></i>
              </button>
            </div>

            <span class="erp-topbar-divider" aria-hidden="true"></span>

            <div class="nav-item dropdown">
              <button type="button" class="erp-user-chip" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Menú de usuario">
                <span class="erp-user-avatar" aria-hidden="true">${userInitials}</span>
                <span class="erp-user-meta">
                  <span class="erp-user-name">${usuario.nombre}</span>
                  <span class="erp-user-role-row">
                    <span class="erp-role-badge erp-role-badge--${rolMeta.tone}">${rolMeta.label}</span>
                    <span class="erp-user-sede">${usuario.sedeNombre || 'Sin sede'}</span>
                  </span>
                </span>
                <i class="ti ti-chevron-down erp-user-chevron" aria-hidden="true"></i>
              </button>
              <div class="dropdown-menu dropdown-menu-end erp-user-dropdown">
                <div class="erp-user-dropdown-header">
                  <span class="erp-user-avatar erp-user-avatar--lg" aria-hidden="true">${userInitials}</span>
                  <div>
                    <div class="erp-user-dropdown-name">${usuario.nombre}</div>
                    <div class="erp-user-dropdown-email">${usuario.email || ''}</div>
                  </div>
                </div>
                <div class="dropdown-divider"></div>
                <a href="#" id="logout-btn" class="dropdown-item text-danger">
                  <i class="ti ti-logout me-2" aria-hidden="true"></i>Cerrar sesión
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Main Area -->
      <div id="main-content" class="page-body"></div>
    </div>
    ${buildMobileNavigation(modulos)}
  `;

  // Listener para logout
  requireElement('logout-btn', HTMLElement).addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });
  document.querySelectorAll('#sidebar-menu .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 991.98px)').matches) {
        bootstrap.Collapse.getOrCreateInstance(requireElement('sidebar-menu', HTMLElement), { toggle: false }).hide();
      }
    });
  });
  const sidebarMenu = requireElement('sidebar-menu', HTMLElement);
  const sidebarToggle = requireSelector('#sidebar-container .navbar-toggler', HTMLButtonElement);
  const closeMobileMenu = () => {
    if (window.matchMedia('(max-width: 991.98px)').matches && sidebarMenu.classList.contains('show')) {
      bootstrap.Collapse.getOrCreateInstance(sidebarMenu, { toggle: false }).hide();
    }
  };
  container.addEventListener('click', event => {
    if (event.target instanceof Node && !sidebarMenu.contains(event.target) && !sidebarToggle.contains(event.target)) closeMobileMenu();
  });
  container.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebarMenu.classList.contains('show') && window.matchMedia('(max-width: 991.98px)').matches) {
      closeMobileMenu();
      sidebarToggle.focus();
    }
  });
  sidebarMenu.addEventListener('shown.bs.collapse', () => sidebarToggle.setAttribute('aria-label', 'Cerrar menú de navegación'));
  sidebarMenu.addEventListener('hidden.bs.collapse', () => sidebarToggle.setAttribute('aria-label', 'Abrir menú de navegación'));
  const mobileModules = requireElement('mobile-modules-modal', HTMLElement);
  const moduleSearch = requireElement('mobile-module-search', HTMLInputElement);
  const filterModules = () => {
    const term = moduleSearch.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    let visible = 0;
    let section: HTMLElement | null = null;
    let sectionHasItems = false;
    for (const item of mobileModules.querySelectorAll<HTMLElement>('.erp-mobile-module-list > li')) {
      if (item.classList.contains('nav-section')) {
        if (section) section.hidden = !sectionHasItems;
        section = item; sectionHasItems = false;
      } else {
        item.hidden = !item.textContent?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(term);
        if (!item.hidden) { visible++; sectionHasItems = true; }
      }
    }
    if (section) section.hidden = !sectionHasItems;
    requireElement('mobile-module-empty', HTMLElement).hidden = visible !== 0;
  };
  moduleSearch.addEventListener('input', filterModules);
  mobileModules.addEventListener('hidden.bs.modal', () => {
    moduleSearch.value = ''; filterModules();
    if (window.matchMedia('(max-width: 991.98px)').matches) requireElement('mobile-more-btn', HTMLButtonElement).focus();
  });
  mobileModules.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a.nav-link')) {
      bootstrap.Modal.getOrCreateInstance(mobileModules).hide();
    }
  });
  document.querySelectorAll('.erp-mobile-nav a').forEach(link => link.addEventListener('click', closeMobileMenu));
  mobileNavigationCleanup?.();
  mobileNavigationCleanup = mountMobileNavigation(requireElement('mobile-nav-rail', HTMLElement));

  // Dark/Light Theme Switcher nativo de Tabler
  document.querySelectorAll<HTMLButtonElement>('[data-quick-action]').forEach(button => {
    button.addEventListener('click', () => {
      const currentUser = getUsuario();
      if (!currentUser) return;
      const action = quickActionsForRole(currentUser.rol).find(item => item.id === button.dataset.quickAction);
      if (!action) return;
      bootstrap.Dropdown.getOrCreateInstance(requireElement('btn-quick-actions', HTMLButtonElement)).hide();
      if (window.location.hash.split('?')[0] === action.route && !routerRunning) {
        window.dispatchEvent(new CustomEvent('erp:quick-action', { detail: { action: action.id } }));
      } else {
        window.location.hash = `${action.route}?accion=${action.id}`;
      }
    });
  });
  setupThemeToggler();
}

function updateActiveMenu(hash: string): void {
  const links = document.querySelectorAll('#sidebar-menu .nav-link, #mobile-modules-modal .nav-link');
  links.forEach(l => {
    const linkHash = l.getAttribute('data-hash') || '';
    const linkBase = linkHash.split('?')[0];
    if (linkHash === hash || linkBase === hash) {
      l.parentElement?.classList.add('active');
    } else {
      l.parentElement?.classList.remove('active');
    }
  });
  let directActive = false;
  document.querySelectorAll('.erp-mobile-nav a[data-hash]').forEach(link => {
    const active = link.getAttribute('data-hash') === hash.split('?')[0];
    directActive ||= active;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.getElementById('mobile-more-btn')?.classList.toggle('is-active', !directActive);
  revealMobileModule(document.getElementById('mobile-nav-rail'));
}

function setupThemeToggler() {
  const searchParams = new URLSearchParams(window.location.search);
  const theme = searchParams.get('theme');
  if (theme) {
    localStorage.setItem('theme', theme);
    // Eliminar parámetro de la URL
    searchParams.delete('theme');
    const newPath = window.location.pathname + (searchParams.toString() ? '?' + searchParams.toString() : '') + window.location.hash;
    window.history.replaceState(null, '', newPath);
  }

  const currentTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-bs-theme', currentTheme);

  document.querySelectorAll('.erp-theme-btn[data-theme]').forEach((el) => {
    const theme = el.getAttribute('data-theme');
    el.classList.toggle('is-active', theme === currentTheme);
    el.setAttribute('aria-pressed', theme === currentTheme ? 'true' : 'false');
  });

  document.querySelectorAll<HTMLElement>('[href*="?theme="], .erp-theme-btn[data-theme]').forEach((el) => {
    if (el.dataset.themeBound) return;
    el.dataset.themeBound = '1';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const nextTheme = el.getAttribute('data-theme') || el.getAttribute('href')?.split('=')[1];
      if (!nextTheme) return;
      localStorage.setItem('theme', nextTheme);
      document.body.setAttribute('data-bs-theme', nextTheme);
      setupThemeToggler();
      applyThemeFromCache();
    });
  });

  applyThemeFromCache();
}

// Con type="module" + defer, el DOM ya está listo cuando este script ejecuta.
// Llamar router() directamente en vez de esperar DOMContentLoaded.
window.addEventListener('hashchange', router);

// Ejecutar router inmediatamente (el DOM ya está listo)
applyThemeFromCache();
applyDocumentBranding(getCachedBrand());

(async () => {
  if (isAuthenticated()) {
    try {
      const { apiFetch } = await import('./api.js');
      await initThemeFromServer(apiFetch);
    } catch (err) {
      /* tema por defecto si falla la API */
    }
  }
  await router();
})();
