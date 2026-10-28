import { notifyDataChange } from './utils/live-data.js';
import type { ApiErrorBody, ApiResponses } from '../../../shared/contracts';

export interface ApiOptions extends RequestInit { skipAuth?: boolean; silent?: boolean; }
class ApiRequestError extends Error { status?: number; code?: string; }
function errorFields(value: unknown): Partial<ApiErrorBody> {
  if (typeof value !== 'object' || value === null) return {};
  return {
    error: 'error' in value && typeof value.error === 'string' ? value.error : undefined,
    code: 'code' in value && typeof value.code === 'string' ? value.code : undefined
  };
}

const API_URL = '/api';
let submissionOrigin: HTMLFormElement | null = null;
/** Safari no siempre enfoca el botón al tocarlo; conserva el origen del evento submit. */
export function captureFormRequestOrigin(form: HTMLFormElement): void {
  submissionOrigin = form;
  // Conservar hasta terminar el evento nativo: WebKit ejecuta microtareas entre listeners.
  setTimeout(() => { if (submissionOrigin === form) submissionOrigin = null; }, 0);
}

export async function apiFetch<T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<T | null> {
  const token = localStorage.getItem('token');
  const skipAuth = options.skipAuth === true;
  const silent = options.silent === true;
  
  const headers = new Headers(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' });
  new Headers(options.headers).forEach((value, name) => headers.set(name, value));

  if (token && !skipAuth) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const config: ApiOptions = {
    ...options,
    cache: 'no-store',
    headers
  };
  delete config.skipAuth;
  delete config.silent;

  // Señal de presentación: bloquea únicamente el formulario que origina una escritura.
  // Las comprobaciones mantienen la utilidad disponible en las pruebas sin DOM.
  const writing = !['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase());
  const focusedForm = typeof document !== 'undefined' && typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement.closest('form') : null;
  const form = writing ? submissionOrigin || focusedForm : null;
  const formPending = (pending: boolean) => {
    if (form && typeof CustomEvent !== 'undefined') document.dispatchEvent(new CustomEvent('erp:form-request', { detail: { form, pending } }));
  };
  formPending(true);
  const sourceRoute = typeof window === 'undefined' ? '' : (window.location.hash || '#/dashboard').split('?')[0];
  const reading = ['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase());
  const readState = (state: 'pending' | 'success' | 'error', message = '') => {
    if (reading && typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') document.dispatchEvent(new CustomEvent('erp:read-state', { detail: { endpoint, state, sourceRoute, message } }));
  };
  let failed = false;
  readState('pending');

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const isLoginRequest = endpoint === '/auth/login' || endpoint.endsWith('/auth/login');

    if (response.status === 401) {
      const errorData = errorFields(await response.json().catch(() => ({})));

      if (isLoginRequest) {
        throw new Error(errorData.error || 'Credenciales inválidas.');
      }

      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.hash = '#/login';
      throw new Error(errorData.error || 'Sesión expirada o token inválido.');
    }

    if (!response.ok) {
      const errorData = errorFields(await response.json().catch(() => ({})));
      const err = new ApiRequestError(errorData.error || `Error en la petición: ${response.statusText}`);
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

    // Única frontera de transporte: el contrato no reemplaza validación de entrada.
    const data: unknown = await response.json();
    if (changed) notifyDataChange(endpoint);
    return data as T;
  } catch (error) {
    failed = true;
    readState('error', error instanceof Error ? error.message : 'No se pudo consultar la información.');
    if (!silent) {
      console.error(`Error en API Fetch (${endpoint}):`, error);
    }
    throw error;
  } finally {
    if (!failed) readState('success');
    formPending(false);
  }
}

/** Lecturas con contrato conocido; las escrituras declaran su propio resultado. */
export function apiGet<K extends keyof ApiResponses>(endpoint: K, options: Omit<ApiOptions, 'method' | 'body'> = {}): Promise<ApiResponses[K] | null> {
  return apiFetch<ApiResponses[K]>(endpoint, { ...options, method: 'GET' });
}
