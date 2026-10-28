import type { ModelStatic, Transaction } from 'sequelize';
import type Configuracion = require('../models/ConfiguracionSistema');
export function calcularFechaVencimientoCredito(diasPlazo: number | string = 30) {
  const dias = Math.max(1, parseInt(String(diasPlazo), 10) || 30);
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha;
}

export async function getDiasPlazoCredito(ConfiguracionSistema: ModelStatic<Configuracion>, transaction?: Transaction) {
  const config = await ConfiguracionSistema.findOne({ transaction });
  return parseInt(String(config?.diasPlazoCredito), 10) || 30;
}

