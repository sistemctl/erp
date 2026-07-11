const { Op } = require('sequelize');
const { Cliente } = require('../models');

const DOC_CONSUMIDOR = '222222222';
const NOMBRE_CONSUMIDOR = 'Consumidor Final';

/**
 * Garantiza un cliente genérico para ventas sin datos de facturación.
 * Reutiliza registros legacy ("Cliente General") si existen.
 */
async function ensureConsumidorFinal({ sedeId, transaction } = {}) {
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
    const patch = {};
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

module.exports = {
  ensureConsumidorFinal,
  DOC_CONSUMIDOR,
  NOMBRE_CONSUMIDOR
};
