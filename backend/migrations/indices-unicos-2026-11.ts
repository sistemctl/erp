import type { Sequelize } from 'sequelize';

// 1) Limpieza: cada arranque con DB_SYNC_ALTER=true hacía que Sequelize añadiera OTRA
//    restricción UNIQUE idéntica (p. ej. Usuarios_email_key1 … key391). Se conserva una
//    sola por columna y se eliminan las copias, que solo ralentizan las escrituras.
// 2) Números de documento únicos (factura, venta, cotización, órdenes, devoluciones,
//    garantías). Si una tabla ya tiene números repetidos, NO se crea el índice (el
//    arranque no debe fallar): se listan los duplicados para corregirlos.

const DOCUMENTOS: [string, string][] = [
  ['Facturas', 'numeroFactura'],
  ['Ventas', 'numeroVenta'],
  ['Cotizaciones', 'numeroCotizacion'],
  ['OrdenesReparacion', 'numeroOrden'],
  ['OrdenesInstalacion', 'numeroOrden'],
  ['DevolucionesVenta', 'numero'],
  ['ReclamosGarantia', 'numero']
];

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function limpiarUnicosDuplicados(sequelize: Sequelize) {
  const [grupos] = await sequelize.query(`
    SELECT t.relname AS tabla,
           array_agg(c.conname::text ORDER BY length(c.conname), c.conname) AS restricciones
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.contype = 'u' AND n.nspname = current_schema()
     GROUP BY t.relname, c.conkey
    HAVING count(*) > 1`) as [Array<{ tabla: string; restricciones: string[] }>, unknown];

  let eliminadas = 0;
  for (const { tabla, restricciones } of grupos) {
    // Se conserva la de nombre más corto (la original, p. ej. "Usuarios_email_key").
    for (const nombre of restricciones.slice(1)) {
      if (!/_key\d+$/.test(nombre)) continue; // solo copias numeradas generadas automáticamente
      try {
        await sequelize.query(`ALTER TABLE ${ident(tabla)} DROP CONSTRAINT IF EXISTS ${ident(nombre)}`);
        eliminadas += 1;
      } catch (error) {
        console.warn(`[Migración] No se pudo eliminar la restricción duplicada ${nombre}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (eliminadas) console.warn(`[Migración] Eliminadas ${eliminadas} restricciones UNIQUE duplicadas (generadas por DB_SYNC_ALTER).`);
}

async function indicesDocumentos(sequelize: Sequelize) {
  for (const [tabla, columna] of DOCUMENTOS) {
    const [existe] = await sequelize.query(
      `SELECT 1 FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ix.indkey[0]
        WHERE n.nspname = current_schema() AND t.relname = :tabla AND a.attname = :columna
          AND ix.indisunique AND array_length(ix.indkey::int2[], 1) = 1 AND ix.indpred IS NULL
        LIMIT 1`,
      { replacements: { tabla, columna } }
    ) as [unknown[], unknown];
    if (existe.length) continue;

    let duplicados: Array<{ valor: string; veces: number }>;
    try {
      [duplicados] = await sequelize.query(
        `SELECT ${ident(columna)} AS valor, COUNT(*)::int AS veces FROM ${ident(tabla)}
          WHERE ${ident(columna)} IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 10`
      ) as [Array<{ valor: string; veces: number }>, unknown];
    } catch {
      continue; // tabla o columna inexistente
    }
    if (duplicados.length) {
      console.warn(`[Migración] ${tabla}.${columna} tiene números repetidos (${duplicados.map(d => `${d.valor}×${d.veces}`).join(', ')}); no se creó el índice único. Corríjalos y reinicie.`);
      continue;
    }
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${ident(`${tabla.toLowerCase()}_${columna.toLowerCase()}_unico`)} ON ${ident(tabla)} (${ident(columna)})`
    );
  }
}

async function migrateIndicesUnicos(sequelize: Sequelize) {
  await limpiarUnicosDuplicados(sequelize);
  await indicesDocumentos(sequelize);
}
export { migrateIndicesUnicos };
