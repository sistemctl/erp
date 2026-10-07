// Comprobación HTTP local de sólo lectura. El token temporal nunca se imprime ni se guarda.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { sequelize, Usuario, Caja, Factura } = require('../models');

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
      const body = await response.json();
      if (endpoint.endsWith('/detalle-z')) assert.ok(Object.hasOwn(body.caja, 'arqueoDeclarado'));
      if (endpoint.startsWith('/facturas/')) assert.ok(Object.hasOwn(body, 'pagosCaja'));
      resultados.push({ endpoint, status: response.status });
    }
    fs.writeFileSync(path.resolve(__dirname, '../../audits/2026-10-06/caja-facturas-smoke-live.json'),
      JSON.stringify({ checkedAt: new Date().toISOString(), soloLectura: true, resultados }, null, 2) + '\n');
    console.log(`${resultados.length} endpoints locales respondieron 200 con el código actualizado.`);
  } catch (error) {
    console.error('Falló la comprobación de lectura:', error.message);
    process.exitCode = 1;
  } finally { await sequelize.close(); }
})();
