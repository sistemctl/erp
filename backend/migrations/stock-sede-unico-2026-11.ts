import type { Sequelize } from 'sequelize';

// Una sola fila de stock por (producto, sede). Sin este índice, dos operaciones
// concurrentes de "buscar o crear" podían crear filas duplicadas y partir el stock.
// Idempotente: si ya existen duplicados, se fusionan sumando sus cantidades.
async function migrateStockSedeUnico(sequelize: Sequelize) {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(20261114)', { transaction });
    const [duplicados] = await sequelize.query(
      `SELECT "productoId", "sedeId", COUNT(*)::int AS filas
         FROM "StockSedes"
        GROUP BY "productoId", "sedeId"
       HAVING COUNT(*) > 1`,
      { transaction }
    ) as [Array<{ productoId: string; sedeId: string; filas: number }>, unknown];

    for (const dup of duplicados) {
      await sequelize.query(
        `WITH filas AS (
           SELECT id, cantidad, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS n
             FROM "StockSedes"
            WHERE "productoId" = :productoId AND "sedeId" = :sedeId
         ), total AS (SELECT SUM(cantidad) AS suma FROM filas)
         UPDATE "StockSedes" SET cantidad = (SELECT suma FROM total)
          WHERE id = (SELECT id FROM filas WHERE n = 1)`,
        { replacements: dup, transaction }
      );
      await sequelize.query(
        `DELETE FROM "StockSedes"
          WHERE "productoId" = :productoId AND "sedeId" = :sedeId
            AND id <> (SELECT id FROM "StockSedes"
                        WHERE "productoId" = :productoId AND "sedeId" = :sedeId
                        ORDER BY "createdAt", id LIMIT 1)`,
        { replacements: dup, transaction }
      );
      console.warn(`[Migración] StockSedes: fusionadas ${dup.filas} filas duplicadas de producto ${dup.productoId} en sede ${dup.sedeId}.`);
    }

    await sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "stock_sedes_producto_sede_unico" ON "StockSedes" ("productoId", "sedeId")',
      { transaction }
    );
  });
}
export { migrateStockSedeUnico };
