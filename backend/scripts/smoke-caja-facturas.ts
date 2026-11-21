// Comprobación HTTP local de sólo lectura. El token temporal nunca se imprime ni se guarda.
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');
import runtimePaths = require('../utils/runtime-paths');
const { PROJECT_ROOT } = runtimePaths;
import jwt = require('jsonwebtoken');
import { Op } from 'sequelize';
import models = require('../models');
const { sequelize, Usuario, Caja, Factura } = models;

(async () => {
  try {
    const referencias = await sequelize.transaction(async (transaction) => {
      await sequelize.query('SET TRANSACTION READ ONLY', { transaction });
      const usuario = await Usuario.findOne({ where: { activo: true, rol: { [Op.in]: ['admin', 'superadmin'] } },
        attributes: ['id', 'rol', 'sedeId', 'sessionVersion'], transaction });
      assert.ok(usuario, 'Se necesita un administrador activo para comprobar los endpoints de lectura.');
      const caja = await Caja.findOne({ order: [['createdAt', 'DESC']], transaction });
      const factura = await Factura.findOne({ order: [['createdAt', 'DESC']], transaction });
      return { usuario, caja, factura };
    });
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no configurada.');
    const token = jwt.sign({ userId: referencias.usuario.id, sessionVersion: referencias.usuario.sessionVersion },
      process.env.JWT_SECRET, { expiresIn: '60s' });
    const endpoints = ['/health', '/cartera', '/caja/movimientos'];
    if (referencias.caja) endpoints.push(`/caja/${referencias.caja.id}/detalle-z`);
    if (referencias.factura) endpoints.push(`/facturas/${referencias.factura.id}`);
    const resultados = [];
    for (const endpoint of endpoints) {
      const response = await fetch(`http://127.0.0.1:3000/api${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 200, `HTTP inesperado en ${endpoint}`);
      const body: unknown = await response.json();
      assert.ok(body && typeof body === 'object');
      if (endpoint.endsWith('/detalle-z')) assert.ok('caja' in body && body.caja && typeof body.caja === 'object' && Object.hasOwn(body.caja, 'arqueoDeclarado'));
      if (endpoint.startsWith('/facturas/')) assert.ok(Object.hasOwn(body, 'pagosCaja'));
      resultados.push({ endpoint, status: response.status });
    }
    fs.writeFileSync(path.join(PROJECT_ROOT, 'audits/2026-10-06/caja-facturas-smoke-live.json'),
      JSON.stringify({ checkedAt: new Date().toISOString(), soloLectura: true, resultados }, null, 2) + '\n');
    console.log(`${resultados.length} endpoints locales respondieron 200 con el código actualizado.`);
  } catch (error) {
    console.error('Falló la comprobación de lectura:', (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  } finally { await sequelize.close(); }
})();
