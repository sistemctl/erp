function calcularFechaVencimientoCredito(diasPlazo = 30) {
  const dias = Math.max(1, parseInt(diasPlazo, 10) || 30);
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha;
}

async function getDiasPlazoCredito(ConfiguracionSistema) {
  const config = await ConfiguracionSistema.findOne();
  return parseInt(config?.diasPlazoCredito, 10) || 30;
}

module.exports = {
  calcularFechaVencimientoCredito,
  getDiasPlazoCredito
};
