import type { Request } from 'express';
import type { RequestUser } from '../../shared/contracts';
import { httpError } from './http-error';

export function requireUser(req: Pick<Request, 'usuario'>): RequestUser {
  if (!req.usuario) throw httpError(401, 'No autenticado.');
  return req.usuario;
}
