import { apiFetch } from './api.js';

export async function login(email, password) {
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (data && data.token) {
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

export function getUsuario() {
  const usuario = localStorage.getItem('usuario');
  return usuario ? JSON.parse(usuario) : null;
}
