// Auditoría contra una base propia: nunca utiliza tablas ni usuarios del ERP real.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env'), quiet: true });
const { Client } = require(path.join(backend, 'node_modules/pg'));
const admin = new Client({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 5432, user: process.env.DB_USER || 'postgres', password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'erp_techstore', connectionTimeoutMillis: 5000 });
const database = `erp_mobile_${Date.now()}_${process.pid}_test`;
let created = false, models, server;
(async () => {
  try {
    await admin.connect();
    if (!/^erp_mobile_\d+_\d+_test$/.test(database)) throw new Error('Base temporal no válida');
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    Object.assign(process.env, { DB_NAME: database, DB_SYNC_ALTER: 'false', NODE_ENV: 'production', PORT: '3004', JWT_SECRET: crypto.randomBytes(32).toString('hex'), PUBLIC_BASE_URL: 'http://127.0.0.1:3004', CORS_ORIGINS: 'http://127.0.0.1:3004', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', GEMINI_API_KEY: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
    models = require(path.join(backend, 'dist/models'));
    await models.sequelize.sync();
    const sede = await models.Sede.create({ nombre: 'Principal · prueba móvil', direccion: 'Dirección de prueba', activa: true });
    const users = [];
    for (const rol of ['superadmin', 'admin', 'gerente_sede', 'cajero', 'tecnico', 'contador']) users.push(await models.Usuario.create({ nombre: `Usuario ${rol}`, email: `${rol}@example.invalid`, password: 'fixture-mobile-only', rol, sedeId: sede.id, activo: true }));
    const usuario = users[0];
    await models.ConfiguracionSistema.create({ empresa: 'GAME', notificacionesActivas: false, emailActivo: false, emailFacturaAuto: false, emailCarteraRecordatorio: false });
    const cliente = await models.Cliente.create({ nombre: 'María Alejandra · Empresa de tecnología y servicios especializados', documento: '901234567-1', telefono: '3001234567', email: 'cliente@example.invalid', direccion: 'Dirección extensa de prueba · Bogotá', sedeId: sede.id });
    await models.Cliente.create({ nombre: 'Cliente sin información adicional', sedeId: sede.id });
    const categoria = await models.Categoria.create({ nombre: 'Accesorios y servicios' });
    const producto = await models.Producto.create({ nombre: 'Adaptador multipuerto USB-C con HDMI y Ethernet para equipos de oficina', codigoBarras: 'MOBILE-001', categoriaId: categoria.id, precioVenta: 1234567.89, precioCosto: 20000, stockMinimo: 3, activo: true });
    await models.StockSede.create({ sedeId: sede.id, productoId: producto.id, cantidad: 20 });
    const serie = await models.NumeroSerie.create({ serie: 'IMEI-MOBILE-000000000001', productoId: producto.id, sedeId: sede.id });
    const caja = await models.Caja.create({ sedeId: sede.id, usuarioAperturaId: usuario.id, fecha: require(path.join(backend, 'dist/utils/caja-fecha')).fechaOperativa(), estado: 'abierta', montoApertura: 100000 });
    const reparacion = await models.OrdenReparacion.create({ numeroOrden: 'OR-MOBILE-001', clienteId: cliente.id, sedeId: sede.id, tecnicoId: users[4].id, tipoEquipo: 'Laptop', marca: 'Equipo de prueba', modelo: 'Modelo con nombre extenso', problemaReportado: 'Diagnóstico y mantenimiento preventivo', costoManoObra: 60000, costoRepuestos: 20000, totalCobrado: 80000 });
    await models.RepuestoOrden.create({ ordenId: reparacion.id, productoId: producto.id, cantidad: 1, costoUnitario: 20000 });
    const instalacion = await models.OrdenInstalacion.create({ numeroOrden: 'OI-MOBILE-001', clienteId: cliente.id, sedeId: sede.id, direccion: 'Dirección extensa de prueba', descripcion: 'Instalación de red y equipos' });
    await models.MaterialInstalacion.create({ ordenId: instalacion.id, productoId: producto.id, cantidad: 1, costoUnitario: 20000, precioUnitario: 50000 });
    const proveedor = await models.Proveedor.create({ nombre: 'Distribuidora de accesorios y suministros tecnológicos', nit: '900123456', telefono: '3002223344', email: 'proveedor@example.invalid' });
    const compra = await models.OrdenCompra.create({ proveedorId: proveedor.id, usuarioId: usuario.id, sedeId: sede.id, total: 20000, saldoPendiente: 20000 });
    await models.ItemOrdenCompra.create({ ordenCompraId: compra.id, productoId: producto.id, cantidadPedida: 1, precioUnitario: 20000 });
    const venta = await models.Venta.create({ numeroVenta: 'V-MOBILE-001', clienteId: cliente.id, usuarioId: usuario.id, sedeId: sede.id, cajaId: caja.id, subtotal: 1234567.89, total: 1234567.89 });
    await models.ItemVenta.create({ ventaId: venta.id, productoId: producto.id, cantidad: 1, precioBase: 1234567.89, precioModificado: 1234567.89, descuentoPct: 0, iva: 0, subtotal: 1234567.89 });
    const factura = await models.Factura.create({ numeroFactura: 'F-MOBILE-001', clienteId: cliente.id, sedeId: sede.id, ventaId: venta.id, total: 1234567.89, estado: 'pendiente', fechaVencimiento: new Date(Date.now() + 86400000) });
    await models.CuentaPorCobrar.create({ facturaId: factura.id, clienteId: cliente.id, sedeId: sede.id, totalOriginal: 1234567.89, saldoPendiente: 1234567.89, fechaVencimiento: new Date(Date.now() + 86400000) });
    await models.Cotizacion.create({ numeroCotizacion: 'COT-MOBILE-001', clienteId: cliente.id, usuarioId: usuario.id, sedeId: sede.id, fechaVencimiento: new Date(Date.now() + 86400000), total: 999999999.12 });
    await models.TradeIn.create({ clienteId: cliente.id, sedeId: sede.id, usuarioId: usuario.id, tipoEquipo: 'Laptop', marca: 'Prueba', modelo: 'Modelo extenso de prueba', estadoFisico: 'bueno' });
    await models.ReclamoGarantia.create({ numero: 'RMA-MOBILE-001', serie: serie.serie, sedeId: sede.id, usuarioId: usuario.id, motivo: 'Revisión del equipo de prueba' });
    const empleado = await models.Empleado.create({ nombre: 'Empleado de prueba móvil', documento: '1099999999', sedeId: sede.id, tipoContrato: 'indefinido', fechaIngreso: new Date() });
    await models.Nomina.create({ empleadoId: empleado.id, periodo: new Date().toISOString().slice(0,7) + '-15', tipoPeriodo: 'quincenal', salarioBase: 1500000, neto: 1400000 });
    const occupied = await fetch('http://127.0.0.1:3004/api/health', { signal: AbortSignal.timeout(500) }).catch(() => null);
    if (occupied) throw new Error('El puerto de auditoría 3004 ya está ocupado');
    server = spawn(process.execPath, ['dist/server.js'], { cwd: backend, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    server.stdout.on('data', chunk => { log = (log + chunk).slice(-6000); }); server.stderr.on('data', chunk => { log = (log + chunk).slice(-6000); });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if ((await fetch('http://127.0.0.1:3004/api/health').catch(() => null))?.ok) { ready = true; break; }
      if (server.exitCode !== null) throw new Error(log);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('Servidor aislado no disponible: ' + log);
    await require('./mobile-browser.cjs')({ users, sede, reparacion, backend, base: 'http://127.0.0.1:3004', output: __dirname });
  } finally {
    if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
    if (models) await models.sequelize.close();
    if (created) { await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [database]); await admin.query(`DROP DATABASE "${database}"`); console.log('Base de auditoría eliminada.'); }
    await admin.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
