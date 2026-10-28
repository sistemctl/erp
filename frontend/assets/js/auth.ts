import { apiFetch } from './api.js';
import type { LoginResponse, SessionUser, UserDTO } from '../../../shared/contracts';

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== 'object') return false;
  return 'id' in value && typeof value.id === 'string'
    && 'nombre' in value && typeof value.nombre === 'string'
    && 'rol' in value && typeof value.rol === 'string'
    && ['superadmin', 'admin', 'gerente_sede', 'cajero', 'tecnico', 'contador'].includes(value.rol)
    && 'sedeId' in value && (value.sedeId === null || typeof value.sedeId === 'string')
    && (!('email' in value) || typeof value.email === 'string')
    && (!('sedeNombre' in value) || typeof value.sedeNombre === 'string');
}

export async function login(email: string, password: string): Promise<UserDTO> {
  try {
    const data = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
      silent: true
    });

    if (data && typeof data.token === 'string' && data.token && isSessionUser(data.usuario)
      && typeof data.usuario.email === 'string' && typeof data.usuario.sedeNombre === 'string') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));
      return data.usuario;
    }
    throw new Error('No se recibió el token de autenticación.');
  } catch (error) {
    throw error;
  }
}

export async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.hash = '#/login';
  }
}

export function isAuthenticated() {
  return localStorage.getItem('token') !== null;
}

export function getUsuario(): SessionUser | null {
  const usuario = localStorage.getItem('usuario');
  if (!usuario) return null;
  try {
    const parsed: unknown = JSON.parse(usuario);
    return isSessionUser(parsed) ? parsed : null;
  } catch { return null; }
}

export function requireUsuario(): SessionUser {
  const usuario = getUsuario();
  if (!usuario) throw new Error('La sesión ha vencido. Inicie sesión nuevamente.');
  return usuario;
}
