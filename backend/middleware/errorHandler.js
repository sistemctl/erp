module.exports = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Error interno del servidor.';

  if (status >= 500) {
    console.error('[API]', req.method, req.originalUrl, err);
  }

  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Error interno del servidor.' : message,
    ...(err.code ? { code: err.code } : {})
  });
};
