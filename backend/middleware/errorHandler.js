module.exports = (err, req, res, next) => {
  console.error('Error no controlado:', err);

  const status = err.status || 500;
  const message = err.message || 'Ocurrió un error interno en el servidor.';

  res.status(status).json({
    error: message,
    detalles: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};
