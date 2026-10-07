import { notifyDataChange } from './utils/live-data.js';

const API_URL = '/api';

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const skipAuth = options.skipAuth === true;
  const silent = options.silent === true;
  
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };

  if (token && !skipAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    cache: 'no-store',
    headers
  };
  delete config.skipAuth;
  delete config.silent;

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const isLoginRequest = endpoint === '/auth/login' || endpoint.endsWith('/auth/login');

    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}));

      if (isLoginRequest) {
        throw new Error(errorData.error || 'Credenciales inválidas.');
      }

      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.hash = '#/login';
      throw new Error(errorData.error || 'Sesión expirada o token inválido.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const err = new Error(errorData.error || `Error en la petición: ${response.statusText}`);
      err.status = response.status;
      err.code = errorData.code;
      throw err;
    }

    // Si no hay contenido (por ejemplo, 204 No Content), retornar vacío
    const changed = !['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase());
    if (response.status === 204) {
      if (changed) notifyDataChange(endpoint);
      return null;
    }

    const data = await response.json();
    if (changed) notifyDataChange(endpoint);
    return data;
  } catch (error) {
    if (!silent) {
      console.error(`Error en API Fetch (${endpoint}):`, error);
    }
    throw error;
  }
}
