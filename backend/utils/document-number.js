const { QueryTypes } = require('sequelize');
const DOCUMENTS = {
  VT: ['Ventas', 'numeroVenta'], FE: ['Facturas', 'numeroFactura'], DEV: ['DevolucionesVenta', 'numero'],
  COT: ['Cotizaciones', 'numeroCotizacion'], OR: ['OrdenesReparacion', 'numeroOrden'],
  IN: ['OrdenesInstalacion', 'numeroOrden'], RMA: ['ReclamosGarantia', 'numero']
};

async function initializeDocumentSequences(sequelize, transaction) {
  for (const [prefix, [table, column]] of Object.entries(DOCUMENTS)) {
    const model = Object.values(sequelize.models).find((m) => m.getTableName() === table);
    if (!model?.rawAttributes[column]) continue;
    const sequence = `erp_document_${prefix.toLowerCase()}`;
    await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS "${sequence}"`, { transaction });
    // No reiniciar una secuencia ya adelantada: otros procesos pueden estar vendiendo.
    await sequelize.query(`SELECT setval('"${sequence}"', seed.value, true)
      FROM (SELECT MAX(substring("${column}" from '^[A-Z]+-([0-9]+)$')::bigint) AS value FROM "${table}") seed
      WHERE seed.value > (SELECT last_value FROM "${sequence}")
         OR (seed.value = (SELECT last_value FROM "${sequence}") AND NOT (SELECT is_called FROM "${sequence}"))`, { transaction });
  }
}

async function nextDocumentNumber(sequelize, prefix, transaction) {
  if (!DOCUMENTS[prefix]) throw new Error('Tipo de consecutivo inválido.');
  const rows = await sequelize.query(`SELECT nextval('"erp_document_${prefix.toLowerCase()}"') AS value`, {
    type: QueryTypes.SELECT, transaction
  });
  return `${prefix}-${String(rows[0].value).padStart(6, '0')}`;
}
module.exports = { DOCUMENTS, initializeDocumentSequences, nextDocumentNumber };
