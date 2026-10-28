import { apiFetch } from '../api.js';
import type { ApiOptions } from '../api.js';
/** Queries and mutations whose endpoint promises a JSON body. */
export async function apiRequired<T>(url: string, options?: ApiOptions): Promise<T> {
  const result = await apiFetch<T>(url, options);
  if (result === null) throw new Error('El servidor no devolvió la respuesta esperada.');
  return result;
}
