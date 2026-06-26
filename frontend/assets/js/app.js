import { isAuthenticated, getUsuario, logout } from './auth.js';
import { showToast } from './utils/toast.js';

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
    { name: 'POS / Ventas', hash: '#/pos', icon: 'ti-shopping-cart' },
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
    { name: 'Auditoría', hash: '#/auditlog', icon: 'ti-shield-lock' },
    { name: 'Configuración', hash: '#/config', icon: 'ti-settings' }
  ],
  admin: [
    { name: 'Dashboard', hash: '#/dashboard', icon: 'ti-dashboard' },
    { name: 'POS / Ventas', hash: '#/pos', icon: 'ti-shopping-cart' },
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
    { name: 'Auditoría', hash: '#/auditlog', icon: 'ti-shield-lock' }
  ],
  gerente_sede: [
    { name: 'Dashboard', hash: '#/dashboard', icon: 'ti-dashboard' },
    { name: 'POS / Ventas', hash: '#/pos', icon: 'ti-shopping-cart' },
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
    { name: 'POS / Ventas', hash: '#/pos', icon: 'ti-shopping-cart' },
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

// Router principal
async function router() {
  const hash = window.location.hash || '#/dashboard';
  const appContainer = document.getElementById('app');

  // 1. Verificar si está logueado
  if (!isAuthenticated()) {
    renderLoginView(appContainer);
    return;
  }

  // Verificar que los datos del usuario sean válidos (no null/corruptos)
  const usuarioActual = getUsuario();
  if (!usuarioActual || !usuarioActual.rol) {
    // Token existe pero datos de usuario son inválidos — limpiar y mostrar login
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    renderLoginView(appContainer);
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

  // 3. Renderizar el módulo específico
  const contentContainer = document.getElementById('main-content');
  contentContainer.innerHTML = `
    <div class="container-xl text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <div class="mt-2 text-secondary">Cargando módulo...</div>
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
function renderLoginView(container) {
  container.className = "";
  container.innerHTML = `
    <div class="login-bg">
      <div class="login-card animate__animated animate__fadeIn">
        <div class="text-center mb-4">
          <h1 class="text-white fs-1 fw-bold mb-1"><i class="ti ti-device-laptop me-2 text-primary"></i>TechStore <span class="text-primary">ERP</span></h1>
          <div class="text-muted small">Sistema de Gestión Integrada</div>
        </div>
        
        <h3 class="text-center mb-4 fw-bold" style="color: rgba(255,255,255,0.9);">Iniciar Sesión</h3>
        <div id="login-error" class="alert alert-danger d-none bg-danger-lt border-0 text-white py-2 small mb-3"></div>
        
        <form id="login-form" autocomplete="off" novalidate>
          <div class="mb-3">
            <label class="form-label"><i class="ti ti-user me-1"></i> Nombre de Usuario</label>
            <input type="text" id="login-email" class="form-control" placeholder="Nombre de usuario..." required autocomplete="username">
          </div>
          <div class="mb-4">
            <label class="form-label"><i class="ti ti-lock me-1"></i> Contraseña</label>
            <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
          </div>
          <div class="form-footer mt-2">
            <button type="submit" id="login-btn" class="btn btn-primary w-100 py-2 fs-3">
              <i class="ti ti-login me-2"></i> Ingresar al Sistema
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorDiv.classList.add('d-none');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Ingresando...`;

    try {
      const { login } = await import('./auth.js');
      await login(email, password);
      router(); // Recargar la página con el Shell base
    } catch (err) {
      errorDiv.textContent = err.message || 'Error al conectar con el servidor.';
      errorDiv.classList.remove('d-none');
      btn.disabled = false;
      btn.textContent = 'Ingresar';
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

  // Dividir el nombre de la empresa para estilizarlo en la barra lateral
  const palabras = (config.empresa || 'TechStore Colombia').split(' ');
  const primeraPalabra = palabras[0] || 'TechStore';
  const restoNombre = palabras.slice(1).join(' ') || '';

  // Actualizar el título del documento
  document.title = `${config.empresa || 'TechStore Colombia'} - ERP`;

  const logoHtml = `
    <div class="d-flex align-items-center">
      ${config.logoUrl ? `<img src="${config.logoUrl}" alt="${config.empresa}" class="me-2 sidebar-logo">` : ''}
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
    <aside id="sidebar-container" class="navbar navbar-vertical navbar-expand-lg navbar-dark d-print-none">
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
      <!-- Topbar -->
      <header class="navbar navbar-expand-md navbar-light d-none d-lg-flex d-print-none">
        <div class="container-xl">
          <div class="navbar-nav ms-auto">
            <!-- Theme Toggle -->
            <div class="d-none d-md-flex me-3">
              <a href="?theme=dark" class="nav-link px-0 hide-theme-dark" title="Modo Oscuro" data-bs-toggle="tooltip" data-bs-placement="bottom">
                <i class="ti ti-moon fs-2"></i>
              </a>
              <a href="?theme=light" class="nav-link px-0 hide-theme-light" title="Modo Claro" data-bs-toggle="tooltip" data-bs-placement="bottom">
                <i class="ti ti-sun fs-2"></i>
              </a>
            </div>
            <!-- Profile dropdown -->
            <div class="nav-item dropdown">
              <a href="#" class="nav-link d-flex lh-1 text-reset p-0" data-bs-toggle="dropdown">
                <div class="d-none d-xl-block ps-2">
                  <div>${usuario.nombre}</div>
                  <div class="mt-1 small text-secondary">${usuario.rol.toUpperCase()} | ${usuario.sedeNombre}</div>
                </div>
              </a>
              <div class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                <a href="#" id="logout-btn" class="dropdown-item text-danger">Cerrar Sesión</a>
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
    if (l.getAttribute('data-hash') === hash) {
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

  // Toggle buttons display
  if (currentTheme === 'dark') {
    document.querySelector('.hide-theme-dark')?.classList.add('d-none');
    document.querySelector('.hide-theme-light')?.classList.remove('d-none');
  } else {
    document.querySelector('.hide-theme-dark')?.classList.remove('d-none');
    document.querySelector('.hide-theme-light')?.classList.add('d-none');
  }

  // Setup click listeners
  document.querySelectorAll('[href*="?theme="]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const nextTheme = el.getAttribute('href').split('=')[1];
      localStorage.setItem('theme', nextTheme);
      document.body.setAttribute('data-bs-theme', nextTheme);
      setupThemeToggler();
    });
  });
}

// Con type="module" + defer, el DOM ya está listo cuando este script ejecuta.
// Llamar router() directamente en vez de esperar DOMContentLoaded.
window.addEventListener('hashchange', router);

// Ejecutar router inmediatamente (el DOM ya está listo)
router();
