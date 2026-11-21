import crypto = require('crypto');
import type { Sequelize } from 'sequelize';

// Columnas que bases antiguas pueden no tener y que necesitan algo más que añadirse:
// - OrdenesReparacion.tokenPublico: enlace público de seguimiento. Las órdenes viejas
//   reciben un UUID aleatorio y la columna queda con índice único.
// - Productos.unidadMedida: 'und' por defecto (los productos por metro se marcan aparte).
// Aditiva e idempotente. Un fallo se registra sin detener el arranque, igual que antes
// cuando estos pasos vivían en server.ts.

async function asegurarTokenPublico(sequelize: Sequelize) {
  await sequelize.query('ALTER TABLE "OrdenesReparacion" ADD COLUMN IF NOT EXISTS "tokenPublico" UUID;');
  try {
    await sequelize.query('UPDATE "OrdenesReparacion" SET "tokenPublico" = gen_random_uuid() WHERE "tokenPublico" IS NULL;');
  } catch {
    // gen_random_uuid() no existe en PostgreSQL < 13 sin pgcrypto: se generan desde Node.
    const [filas] = await sequelize.query('SELECT id FROM "OrdenesReparacion" WHERE "tokenPublico" IS NULL;') as [Array<{ id: string }>, unknown];
    for (const fila of filas) {
      await sequelize.query('UPDATE "OrdenesReparacion" SET "tokenPublico" = :token WHERE id = :id AND "tokenPublico" IS NULL;', {
        replacements: { token: crypto.randomUUID(), id: fila.id }
      });
    }
  }
  await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS ordenes_reparacion_token_publico_idx ON "OrdenesReparacion" ("tokenPublico");')
    .catch((error: unknown) => console.warn('[Migración] No se pudo crear el índice único de tokenPublico:', error instanceof Error ? error.message : String(error)));
}

async function migrateColumnasLegado(sequelize: Sequelize) {
  try {
    await asegurarTokenPublico(sequelize);
  } catch (error) {
    console.warn('No se pudo asegurar tokenPublico:', error instanceof Error ? error.message : String(error));
  }

  try {
    await sequelize.query(`ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "unidadMedida" VARCHAR(8) NOT NULL DEFAULT 'und';`);
  } catch (error) {
    console.warn('No se pudo asegurar unidadMedida en Productos:', error instanceof Error ? error.message : String(error));
  }
}

export { migrateColumnasLegado };
