import { QueryTypes } from 'sequelize';
import sequelize = require('../config/database');
import type { Handler } from '../types/controller';
import type { InversionInventarioDTO } from '../../shared/contracts';
import { requireUser } from '../utils/request-user';
import { assertSedeAccess, isGlobalRole } from '../utils/sede';

/** One PostgreSQL statement: every aggregate and page sees the same MVCC snapshot. */
export const INVERSION_SQL = `
WITH existencias AS (
  SELECT s.id, p.id AS "productoId", p.nombre, p."codigoBarras", p.activo,
    s."sedeId", d.nombre AS "sedeNombre", s.cantidad, p."unidadMedida",
    p."precioCosto" AS costo, s.cantidad::numeric * p."precioCosto" AS inversion
  FROM "StockSedes" s
  JOIN "Productos" p ON p.id = s."productoId"
  JOIN "Sedes" d ON d.id = s."sedeId"
  WHERE s.cantidad > 0 AND p."esServicio" IS NOT TRUE AND p."esCombo" IS NOT TRUE
    AND ($sedeId::uuid IS NULL OR s."sedeId" = $sedeId::uuid)
), meta AS (
  SELECT count(*)::int AS total, GREATEST(ceil(count(*) / 50.0)::int, 1) AS paginas FROM existencias
), pagina AS (
  SELECT * FROM existencias ORDER BY inversion DESC, nombre ASC, "productoId" ASC, id ASC
  LIMIT 50 OFFSET ((SELECT LEAST($page::int, paginas) FROM meta) - 1) * 50
), por_sede AS (
  SELECT "sedeId", "sedeNombre", round(sum(inversion), 2)::text AS importe,
    count(DISTINCT "productoId")::int AS productos FROM existencias GROUP BY "sedeId", "sedeNombre"
)
SELECT jsonb_build_object(
  'consultadoEn', statement_timestamp(),
  'alcance', jsonb_build_object('sedeId', $sedeId::uuid, 'nombre', CASE WHEN $sedeId::uuid IS NULL
    THEN 'Todas las sedes' ELSE (SELECT nombre FROM "Sedes" WHERE id = $sedeId::uuid) END),
  'resumen', (SELECT jsonb_build_object('inversionTotal', round(COALESCE(sum(inversion), 0), 2)::text,
    'productosConExistencias', count(DISTINCT "productoId"),
    'productosSinCosto', count(DISTINCT "productoId") FILTER (WHERE costo = 0)) FROM existencias),
  'sedes', COALESCE((SELECT jsonb_agg(jsonb_build_object('sedeId', "sedeId", 'nombre', "sedeNombre",
    'inversionTotal', importe, 'productosConExistencias', productos) ORDER BY "sedeNombre", "sedeId") FROM por_sede), '[]'::jsonb),
  'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'productoId', "productoId", 'nombre', nombre,
    'codigoBarras', "codigoBarras", 'activo', activo, 'sedeId', "sedeId", 'sedeNombre', "sedeNombre",
    'cantidad', cantidad, 'unidadMedida', "unidadMedida", 'costoUnitario', costo::text,
    'inversionTotal', round(inversion, 2)::text, 'sinCosto', costo = 0)
    ORDER BY inversion DESC, nombre ASC, "productoId" ASC, id ASC) FROM pagina), '[]'::jsonb),
  'pagination', (SELECT jsonb_build_object('page', LEAST($page::int, paginas), 'limit', 50,
    'total', total, 'totalPages', paginas) FROM meta)
) AS reporte`;

export const getInversionInventario: Handler = async (req, res, next) => {
  try {
    const usuario = requireUser(req);
    const rawSede = req.query.sedeId;
    if (rawSede !== undefined && (typeof rawSede !== 'string' || !rawSede)) {
      return res.status(isGlobalRole(usuario.rol) ? 400 : 403).json({ error: 'Indique una sede válida.' });
    }
    if (!isGlobalRole(usuario.rol)) assertSedeAccess(usuario, rawSede ?? usuario.sedeId);
    const sedeId = isGlobalRole(usuario.rol) ? rawSede ?? null : usuario.sedeId;
    if (sedeId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sedeId)) {
      return res.status(400).json({ error: 'La sede no es válida.' });
    }
    const rawPage = req.query.page ?? '1';
    if (typeof rawPage !== 'string' || !/^[1-9]\d*$/.test(rawPage) || Number(rawPage) > 2147483647) {
      return res.status(400).json({ error: 'La página no es válida.' });
    }
    const [row] = await sequelize.query<{ reporte: InversionInventarioDTO }>(INVERSION_SQL, {
      type: QueryTypes.SELECT, bind: { sedeId, page: Number(rawPage) }
    });
    if (!row.reporte.alcance.nombre) return res.status(404).json({ error: 'Sede no encontrada.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(row.reporte);
  } catch (error) { next(error); }
};
