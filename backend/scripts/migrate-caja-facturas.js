const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sequelize = require('../config/database');
const { migrateCajaFacturasSchema } = require('../migrations/caja-facturas-2026-10');

async function conteos() {
  const [rows] = await sequelize.query(`SELECT
    (SELECT count(*) FROM "Cajas") AS cajas,
    (SELECT count(*) FROM "Facturas") AS facturas,
    (SELECT count(*) FROM "Abonos") AS abonos,
    (SELECT count(*) FROM "CuentasPorCobrar") AS cartera`);
  return rows[0];
}

(async () => {
  try {
    await sequelize.authenticate();
    const antes = await conteos();
    await migrateCajaFacturasSchema(sequelize);
    const despues = await conteos();
    assert.deepEqual(despues, antes, 'La migración debe conservar los registros existentes.');
    const campos = { Facturas: ['cajaId', 'pagosCaja', 'cajaRevertidaAt'], Abonos: ['cajaId', 'anuladoAt'],
      CuentasPorCobrar: ['anuladaAt'], Cajas: ['arqueoDeclarado', 'ingresosAlCierre'] };
    for (const [tabla, columnas] of Object.entries(campos)) {
      const esquema = await sequelize.getQueryInterface().describeTable(tabla);
      for (const columna of columnas) assert.ok(esquema[columna], `${tabla}.${columna}`);
    }
    const evidencia = { checkedAt: new Date().toISOString(), antes, despues, campos, aplicada: true };
    fs.writeFileSync(path.resolve(__dirname, '../../audits/2026-10-06/caja-facturas-migracion-live.json'),
      JSON.stringify(evidencia, null, 2) + '\n');
    console.log('Migración de caja/facturas aplicada: 8 columnas verificadas; conteos de registros conservados.');
  } catch (error) {
    console.error('No se completó la migración de caja/facturas:', error.message);
    process.exitCode = 1;
  } finally { await sequelize.close(); }
})();
