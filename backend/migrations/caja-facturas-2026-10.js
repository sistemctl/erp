// Aditiva e idempotente: conserva los registros históricos sin inventar sus cobros.
async function migrateCajaFacturasSchema(sequelize) {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(20261007)', { transaction });
    const statements = [
      'ALTER TABLE "Facturas" ADD COLUMN IF NOT EXISTS "cajaId" UUID REFERENCES "Cajas"("id")',
      'ALTER TABLE "Facturas" ADD COLUMN IF NOT EXISTS "pagosCaja" JSONB',
      'ALTER TABLE "Facturas" ADD COLUMN IF NOT EXISTS "cajaRevertidaAt" TIMESTAMP WITH TIME ZONE',
      'ALTER TABLE "Abonos" ADD COLUMN IF NOT EXISTS "cajaId" UUID REFERENCES "Cajas"("id")',
      'ALTER TABLE "Abonos" ADD COLUMN IF NOT EXISTS "anuladoAt" TIMESTAMP WITH TIME ZONE',
      'ALTER TABLE "CuentasPorCobrar" ADD COLUMN IF NOT EXISTS "anuladaAt" TIMESTAMP WITH TIME ZONE',
      'ALTER TABLE "Cajas" ADD COLUMN IF NOT EXISTS "arqueoDeclarado" JSONB',
      'ALTER TABLE "Cajas" ADD COLUMN IF NOT EXISTS "ingresosAlCierre" JSONB',
      'CREATE INDEX IF NOT EXISTS facturas_caja_idx ON "Facturas" ("cajaId")',
      'CREATE INDEX IF NOT EXISTS abonos_caja_idx ON "Abonos" ("cajaId")'
    ];
    for (const sql of statements) await sequelize.query(sql, { transaction });
  });
}
module.exports = { migrateCajaFacturasSchema };
