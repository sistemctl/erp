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
    error: message
  });
};
