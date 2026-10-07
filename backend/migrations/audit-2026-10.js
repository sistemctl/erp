const { initializeDocumentSequences } = require('../utils/document-number');

// Cambios aditivos e idempotentes, también en bases existentes de producción.
async function migrateAuditSchema(sequelize) {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(20261006)', { transaction });
    await sequelize.query('ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "esCombo" BOOLEAN NOT NULL DEFAULT false', { transaction });
    await sequelize.query('ALTER TABLE "Usuarios" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0', { transaction });
    await sequelize.query('ALTER TABLE "ItemsVenta" ADD COLUMN IF NOT EXISTS "numeroSerieId" UUID REFERENCES "NumerosSerie"("id") ON DELETE SET NULL', { transaction });
    await sequelize.query('ALTER TABLE "ItemsVenta" ADD COLUMN IF NOT EXISTS "ivaTotal" DECIMAL(15,2)', { transaction });
    await initializeDocumentSequences(sequelize, transaction);
  });
}
module.exports = { migrateAuditSchema };
