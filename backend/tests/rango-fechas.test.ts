import { test } from 'node:test';
import assert = require('node:assert/strict');
import { Op } from 'sequelize';
import { filtroFechaBogota } from '../utils/rango-bogota';

test('filtroFechaBogota incluye el día completo de "hasta" en hora de Bogotá', () => {
  const filtro = filtroFechaBogota('2026-11-21', '2026-11-21');
  assert.ok(filtro);
  // 00:00 y 23:59:59.999 en Bogotá (UTC-5), sin depender de la zona horaria del servidor.
  assert.equal(filtro[Op.gte]?.toISOString(), '2026-11-21T05:00:00.000Z');
  assert.equal(filtro[Op.lte]?.toISOString(), '2026-11-22T04:59:59.999Z');
});

test('filtroFechaBogota admite una sola fecha y omite el filtro sin fechas', () => {
  assert.equal(filtroFechaBogota(undefined, ''), undefined);
  const soloDesde = filtroFechaBogota('2026-01-05', undefined);
  assert.equal(soloDesde?.[Op.gte]?.toISOString(), '2026-01-05T05:00:00.000Z');
  assert.equal(soloDesde?.[Op.lte], undefined);
  const soloHasta = filtroFechaBogota(undefined, '2026-01-05');
  assert.equal(soloHasta?.[Op.gte], undefined);
  assert.equal(soloHasta?.[Op.lte]?.toISOString(), '2026-01-06T04:59:59.999Z');
});

test('filtroFechaBogota responde 400 ante fechas inválidas', () => {
  for (const malo of ['ayer', '2026-13-40', ['2026-01-01']]) {
    assert.throws(() => filtroFechaBogota(malo, undefined), (err: { status?: number }) => err.status === 400);
  }
});
