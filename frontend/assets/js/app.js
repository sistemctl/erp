import { isAuthenticated, getUsuario, logout } from './auth.js';
import { showToast } from './utils/toast.js';
import { applyThemeFromCache, initThemeFromServer } from './utils/theme.js';
import { applyDocumentBranding, getCachedBrand, resolveAssetUrl } from './utils/branding.js';

// Anular global alert del navegador con una notificación Toast Premium animada
window.alert = (message) => {
  let type = 'info';
  const msgLower = (message || '').toString().toLowerCase();
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


const modulosPorRol = {
  superadmin: [
    { name: 'Dashboard', hash: '#/dashboard', icon: 'ti-dashboard' },
    { name: 'Punto de venta', hash: '#/pos', icon: 'ti-shopping-cart' },
    { name: 'Historial Ventas', hash: '#/ventas', icon: 'ti-receipt' },
    { name: 'Clientes CRM', hash: '#/clientes', icon: 'ti-users-group' },
    { name: 'Reparaciones', hash: '#/reparaciones', icon: 'ti-tool' },
    { name: 'Rentabilidad', hash: '#/rentabilidad', icon: 'ti-chart-bar' },
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
    { name: 'Rentabilidad', hash: '#/rentabilidad', icon: 'ti-chart-bar' },
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
    { name: 'Rentabilidad', hash: '#/rentabilidad', icon: 'ti-chart-bar' },
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
    { name: 'Inventario (Ver)', hash: '#/inventario', icon: 'ti-package' }
  ],
  tecnico: [
    { name: 'Reparaciones', hash: '#/reparaciones', icon: 'ti-tool' }
  ],
  contador: [
    { name: 'Dashboard', hash: '#/dashboard', icon: 'ti-dashboard' },
    { name: 'Historial Ventas', hash: '#/ventas', icon: 'ti-receipt' },
    { name: 'Facturación', hash: '#/facturacion', icon: 'ti-file-text' },
    { name: 'Nómina', hash: '#/nomina', icon: 'ti-users' },
    { name: 'Compras', hash: '#/compras', icon: 'ti-truck' },
    { name: 'Proveedores', hash: '#/proveedores', icon: 'ti-building-factory' },
    { name: 'Caja', hash: '#/caja', icon: 'ti-building-store' },
    { name: 'Rentabilidad', hash: '#/rentabilidad', icon: 'ti-chart-bar' }
  ]
};

const ROL_META = {
  superadmin: { label: 'Superadmin', tone: 'violet' },
  admin: { label: 'Administrador', tone: 'blue' },
  gerente_sede: { label: 'Gerente de sede', tone: 'cyan' },
  cajero: { label: 'Cajero', tone: 'green' },
  tecnico: { label: 'Técnico', tone: 'amber' },
  contador: { label: 'Contador', tone: 'slate' },
};

function getInitials(nombre) {
  return (nombre || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function getModuleLabel(rawHash, rol) {
  const hash = (rawHash || '#/dashboard').split('?')[0] || '#/dashboard';
  const params = new URLSearchParams((rawHash || '').split('?')[1] || '');
  if (hash === '#/config' && params.get('tab') === 'auditoria') return 'Auditoría';
  const modulos = modulosPorRol[rol] || [];
  const match = modulos.find((m) => {
    const base = m.hash.split('?')[0];
    return m.hash === rawHash || base === hash;
  });
  if (match) return match.name;
  const labels = {
    '#/config': 'Configuración',
    '#/series': 'Series / IMEI',
    '#/dashboard': 'Dashboard',
  };
  return labels[hash] || 'Inicio';
}

function updateTopbarContext(rawHash) {
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
async function router() {
  const rawHash = window.location.hash || '#/dashboard';
  const hash = rawHash.split('?')[0] || '#/dashboard';
  const appContainer = document.getElementById('app');

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

  // 2. Renderizar contenedor base con Sidebar y Topbar (si no se ha renderizado)
  if (!document.getElementById('sidebar-container')) {
    await renderBaseShell(appContainer);
  }

  // Actualizar el estado del menú activo en el sidebar
  updateActiveMenu(hash);
  updateTopbarContext(rawHash);

  // 3. Renderizar el módulo específico
  const contentContainer = document.getElementById('main-content');
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

  try {
    switch (hash) {
      case '#/dashboard':
        const { initDashboard } = await import('./modules/dashboard.js');
        await initDashboard(contentContainer);
        break;
      case '#/pos':
        const { initPos, destroyPos } = await import('./modules/pos.js');
        await initPos(contentContainer);
        window.activeModuleCleanup = destroyPos;
        break;
      case '#/inventario':
        const { initInventario } = await import('./modules/inventario.js');
        await initInventario(contentContainer);
        break;
      case '#/series':
        const { initSeries } = await import('./modules/series.js');
        await initSeries(contentContainer);
        break;
      case '#/reparaciones':
        const { initReparaciones } = await import('./modules/reparaciones.js');
        await initReparaciones(contentContainer);
        break;
      case '#/rentabilidad':
        const { initRentabilidad } = await import('./modules/rentabilidad.js');
        await initRentabilidad(contentContainer);
        break;
      case '#/facturacion':
        const { initFacturacion } = await import('./modules/facturacion.js');
        await initFacturacion(contentContainer);
        break;
      case '#/ventas':
        const { initVentas } = await import('./modules/ventas.js');
        await initVentas(contentContainer);
        break;
      case '#/clientes':
        const { initClientes } = await import('./modules/clientes.js');
        await initClientes(contentContainer);
        break;
      case '#/nomina':
        const { initNomina } = await import('./modules/nomina.js');
        await initNomina(contentContainer);
        break;
      case '#/compras':
        const { initCompras } = await import('./modules/compras.js');
        await initCompras(contentContainer);
        break;
      case '#/proveedores':
        const { initProveedores } = await import('./modules/proveedores.js');
        await initProveedores(contentContainer);
        break;
      case '#/caja':
        const { initCaja } = await import('./modules/caja.js');
        await initCaja(contentContainer);
        break;
      case '#/cotizaciones':
        const { initCotizaciones } = await import('./modules/cotizaciones.js');
        await initCotizaciones(contentContainer);
        break;
      case '#/tradein':
        const { initTradeIn } = await import('./modules/tradein.js');
        await initTradeIn(contentContainer);
        break;
      case '#/cartera':
        const { initCartera } = await import('./modules/cartera.js');
        await initCartera(contentContainer);
        break;
      case '#/auditlog':
        window.location.hash = '#/config?tab=auditoria';
        return;
      case '#/config':
        const { initConfig } = await import('./modules/config.js');
        await initConfig(contentContainer);
        break;
      case '#/auditlog':
        const { initAuditLog } = await import('./modules/auditlog.js');
        await initAuditLog(contentContainer);
        break;
      default:
        contentContainer.innerHTML = `
          <div class="container-xl py-5">
            <div class="alert alert-info">
              <h4 class="alert-title">Módulo en Desarrollo</h4>
              <div class="text-secondary">El módulo para la ruta <strong>${hash}</strong> se habilitará en la siguiente fase de desarrollo técnico.</div>
            </div>
          </div>
        `;
        break;
    }
  } catch (error) {
    console.error('Error al cargar módulo:', error);
    contentContainer.innerHTML = `
      <div class="container-xl py-5">
        <div class="alert alert-danger">
          <h4 class="alert-title">Error al cargar el módulo</h4>
          <div class="text-secondary">${error.message}</div>
        </div>
      </div>
    `;
  }
}

// Vista de Login
async function renderLoginView(container) {
  const colorScheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-bs-theme', colorScheme);

  let brand = getCachedBrand();
  try {
    const { apiFetch } = await import('./api.js');
    const { applyTheme, applyThemeFromCache } = await import('./utils/theme.js');
    const remote = await apiFetch('/config/branding');
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

  const form = document.getElementById('login-form');
  const btn = document.getElementById('login-btn');
  const submitDefaultHtml = btn.innerHTML;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');

    errorDiv.classList.add('d-none');
    btn.disabled = true;
    btn.innerHTML = 'Ingresando…';

    try {
      const { login } = await import('./auth.js');
      await login(email, password);
      router();
    } catch (err) {
      errorDiv.textContent = err.message || 'No se pudo conectar. Verifica usuario y contraseña.';
      errorDiv.classList.remove('d-none');
      btn.disabled = false;
      btn.innerHTML = submitDefaultHtml;
    }
  });
}

// Shell base con Sidebar y Topbar
async function renderBaseShell(container) {
  const usuario = getUsuario();
  const modulos = modulosPorRol[usuario.rol] || [];

  let config = { empresa: 'TechStore Colombia' };
  try {
    const { apiFetch } = await import('./api.js');
    config = await apiFetch('/config/sistema');
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
  // Sidebar list items
  const menuItemsHtml = modulos.map(m => `
    <li class="nav-item">
      <a class="nav-link" href="${m.hash}" data-hash="${m.hash}">
        <span class="nav-link-icon d-md-none d-lg-inline-block">
          <i class="ti ${m.icon} fs-2"></i>
        </span>
        <span class="nav-link-title">${m.name}</span>
      </a>
    </li>
  `).join('');

  container.innerHTML = `
    <!-- Sidebar -->
    <aside id="sidebar-container" class="navbar navbar-vertical navbar-expand-lg d-print-none">
      <div class="container-fluid">
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#sidebar-menu">
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
      <header class="navbar erp-topbar d-none d-lg-flex d-print-none">
        <div class="container-xl erp-topbar-inner">
          <div class="erp-topbar-context" aria-live="polite">
            <span class="erp-topbar-accent" aria-hidden="true"></span>
            <div class="erp-topbar-context-text">
              <p class="erp-topbar-kicker" id="topbar-module-kicker">${initialKicker}</p>
              <h2 class="erp-topbar-title" id="topbar-module-title">${initialModule}</h2>
            </div>
          </div>

          <div class="erp-topbar-actions">
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
  `;

  // Listener para logout
  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  // Dark/Light Theme Switcher nativo de Tabler
  setupThemeToggler();
}

function updateActiveMenu(hash) {
  const links = document.querySelectorAll('#sidebar-menu .nav-link');
  links.forEach(l => {
    const linkHash = l.getAttribute('data-hash') || '';
    const linkBase = linkHash.split('?')[0];
    if (linkHash === hash || linkBase === hash) {
      l.parentElement.classList.add('active');
    } else {
      l.parentElement.classList.remove('active');
    }
  });
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

  document.querySelectorAll('[href*="?theme="], .erp-theme-btn[data-theme]').forEach((el) => {
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
    } catch (_) { /* use cache */ }
  }
  router();
})();
