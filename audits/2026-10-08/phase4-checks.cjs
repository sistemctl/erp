const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ models: m, sede, usuario, backend, baseUrl }) => {
  const results = [];
  async function check(name, fn) { await fn(); results.push({ name, passed: true }); console.log('OK ' + name); }
  const config = await m.ConfiguracionSistema.findOne() || await m.ConfiguracionSistema.create({ empresa: 'Prueba fase 4' });
  await config.update({ emailActivo: false, notificacionesActivas: false, emailCarteraRecordatorio: false,
    smtpHost: null, smtpUser: null });
  const login = await fetch(baseUrl + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usuario.email, password: 'fixture-local-only' }) });
  assert.equal(login.status, 200);
  const token = (await login.json()).token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function request(route, body) {
    const response = await fetch(baseUrl + route, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, route + ': ' + (response.ok ? '' : await response.text()));
    return response;
  }
  const cliente = await m.Cliente.create({ nombre: 'Cliente de reportes', documento: 'PHASE4', sedeId: sede.id });
  const proveedor = await m.Proveedor.create({ nombre: 'Proveedor de reportes', nit: 'PHASE4-NIT' });
  const compra = await m.OrdenCompra.create({ proveedorId: proveedor.id, usuarioId: usuario.id, sedeId: sede.id,
    total: 1200, saldoPendiente: 1000, estado: 'pendiente', estadoPago: 'abono_parcial', fechaVencimientoPago: new Date() });
  await m.PagoCompra.create({ ordenCompraId: compra.id, usuarioId: usuario.id, monto: 200, fuenteFondos: 'efectivo_externo' });
  const caja = await m.Caja.findOne({ where: { sedeId: sede.id, estado: 'abierta' } });
  const categoria = await m.CategoriaEgreso.create({ nombre: 'Gastos prueba' });
  await m.EgresoCaja.create({ cajaId: caja.id, categoriaId: categoria.id, usuarioId: usuario.id, monto: 50, motivo: 'Prueba de agregados' });
  await check('Dashboard: KPI, actividad, gastos y gráficos diarios/mensuales con GROUP BY', async () => {
    for (const periodo of ['hoy','semana','mes','año']) {
      for (const route of ['kpis','graficas/ventas','actividad','gastos-por-categoria','gasto-resumen']) {
        const data = await (await request(`/dashboard/${route}?sede=${sede.id}&periodo=${encodeURIComponent(periodo)}`)).json();
        assert.ok(data && typeof data === 'object');
      }
    }
    const kpi = await (await request(`/dashboard/kpis?sede=${sede.id}&periodo=hoy`)).json();
    assert.equal(kpi.totalComprasPagadas,200); assert.equal(kpi.totalGastosOperativos,50);
    for (const tipo of ['ventas','unidades','reparaciones_activas','tiempo_promedio','stock_bajo','clientes_nuevos','caja','cartera','cartera_vencida','cuentas_por_pagar','compras_pagadas','gastos','gasto_total','utilidad']) {
      const data = await (await request(`/dashboard/detalle/${tipo}?sede=${sede.id}`)).json(); assert.ok(Array.isArray(data.filas));
    }
  });
  await check('Analítica: agregados financieros, inventario, productos y exportación CSV', async () => {
    for (const route of ['finanzas/cartera','finanzas/cuentas-por-pagar','finanzas/flujo-caja','ventas/por-metodo-pago','ventas/top-productos','inventario/valorizado']) {
      await (await request(`/analytics/${route}?sede=${sede.id}`)).json();
    }
    for (const reporte of ['cartera','cuentas-por-pagar']) {
      const response = await request(`/analytics/export/csv?reporte=${reporte}&sede=${sede.id}`);
      assert.match(response.headers.get('content-type'),/text\/csv/); assert.ok((await response.text()).length>10);
    }
  });
  const empleado = await m.Empleado.create({ nombre: 'Colaborador prueba', documento: 'PHASE4-EMP', sedeId: sede.id,
    tipoContrato: 'indefinido', salarioBase: 1300000, fechaIngreso: new Date(), auxilioTransporte: true });
  await check('Nómina: liquidación quincenal y desprendible PDF', async () => {
    const response = await fetch(baseUrl+'/nomina/calcular',{ method:'POST',headers,body:JSON.stringify({empleadoId:empleado.id,periodo:'2026-10-15',tipoPeriodo:'quincenal'}) });
    assert.equal(response.status,201);const nomina=await response.json();
    const pdf=await request(`/nomina/${nomina.id}/desprendible-pdf`);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  });
  await check('Jobs: vencimientos en PostgreSQL; canales desactivados no envían mensajes', async () => {
    const factura=await m.Factura.create({numeroFactura:'P4-JOB',clienteId:cliente.id,sedeId:sede.id,subtotal:100,iva:0,total:100,estado:'pendiente',fechaVencimiento:new Date('2020-01-01')});
    const cuenta=await m.CuentaPorCobrar.create({facturaId:factura.id,clienteId:cliente.id,totalOriginal:100,saldoPendiente:100,fechaVencimiento:new Date('2020-01-01'),estado:'al_dia'});
    const jobs=require(path.join(backend,'dist/jobs/cartera.job'));await jobs.actualizarEstadosVencidos();
    await cuenta.reload();await factura.reload();assert.equal(cuenta.estado,'vencida');assert.equal(factura.estado,'vencida');
    assert.deepEqual(await jobs.enviarRecordatoriosCartera(),{enviados:0,fallidos:0});
    assert.deepEqual(await require(path.join(backend,'dist/jobs/stock.job')).alertarStockBajo(),{alertas:0,enviados:0});
    assert.deepEqual(await require(path.join(backend,'dist/services/email.service')).enviarFacturaPorEmailAuto(factura.id),{skipped:true});
    await require(path.join(backend,'dist/services/twilio.service')).enviarNotificacionReparacion('no-order','recibido');
    await config.update({emailActivo:false});
  });
  fs.writeFileSync(path.join(__dirname,'phase4-isolated-results.json'),JSON.stringify({checkedAt:new Date().toISOString(),database:'Temporal independiente; se elimina al finalizar',results},null,2)+'\n');
};
