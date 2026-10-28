import type { Transaction } from 'sequelize';
import models = require('../models');
import { Op } from 'sequelize';
const { Cliente, Sede } = models;

export const DOC_CONSUMIDOR = '222222222';
export const NOMBRE_CONSUMIDOR = 'Consumidor Final';

/**
 * Garantiza un cliente genérico para ventas sin datos de facturación.
 * Reutiliza registros legacy ("Cliente General") si existen.
 */
export async function ensureConsumidorFinal({ sedeId, transaction }: { sedeId?: string; transaction?: Transaction } = {}) {
  if (!sedeId) {
    throw new Error('Se requiere sedeId para crear Consumidor Final.');
  }

  let cliente = await Cliente.findOne({
    where: {
      [Op.or]: [
        { documento: DOC_CONSUMIDOR },
        { documento: '222222222-0' },
        { documento: '222222222222' },
        { nombre: { [Op.iLike]: 'Consumidor Final' } },
        { nombre: { [Op.iLike]: 'Cliente General' } },
        { nombre: { [Op.iLike]: 'Cliente General (Sin registro)' } }
      ]
    },
    order: [['createdAt', 'ASC']],
    transaction
  });

  if (cliente) {
    const patch: { nombre?: string; documento?: string } = {};
    if (cliente.nombre !== NOMBRE_CONSUMIDOR) patch.nombre = NOMBRE_CONSUMIDOR;
    if (!cliente.documento) patch.documento = DOC_CONSUMIDOR;
    if (Object.keys(patch).length) {
      await cliente.update(patch, { transaction });
    }
    return cliente;
  }

  return Cliente.create({
    nombre: NOMBRE_CONSUMIDOR,
    documento: DOC_CONSUMIDOR,
    direccion: 'Colombia',
    sedeId
  }, { transaction });
}

/** Crea/actualiza Consumidor Final al arrancar el servidor (si hay al menos una sede). */
export async function bootstrapConsumidorFinal() {
  const sede = await Sede.findOne({
    where: { activa: true },
    order: [['createdAt', 'ASC']]
  }) || await Sede.findOne({ order: [['createdAt', 'ASC']] });

  if (!sede) {
    console.warn('Sin sedes: Consumidor Final se creará en la primera venta sin cliente.');
    return null;
  }

  const cliente = await ensureConsumidorFinal({ sedeId: sede.id });
  console.log(`Cliente genérico listo: ${cliente.nombre} (${cliente.documento})`);
  return cliente;
}

