export interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}
export function httpError(status: number, message: string, code?: string): HttpError {
  const error: HttpError = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}
