const assert = require('node:assert/strict');
const { nextDocumentNumber } = require('../../backend/utils/document-number');

module.exports = async ({ check, m, request, adminToken, cashToken, A, B, caja, service, product, cliente, saleBody, url }) => {
  async function open(name, montoApertura = 100000) {
    const sede = await m.Sede.create({ nombre: name, direccion: 'Solo pruebas temporales' });
    const response = await request('/caja/apertura', adminToken, { sedeId: sede.id, montoApertura });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return { sede, caja: await m.Caja.findByPk(response.body.id) };
  }
  async function saleAt(sede, p = service, extra = {}) {
    const response = await request('/ventas', adminToken, saleBody(p, { sedeId: sede.id, ...extra }));
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body;
  }
  const category = await m.CategoriaEgreso.create({ nombre: 'Auditoría caja', activa: true });

  await check('CF01: apertura, efectivo neto, egreso y cierre cuadran', async () => {
    const fixture = await open('Caja: flujo completo');
    const sold = await saleAt(fixture.sede, service, { pagos: [{ metodo: 'efectivo', monto: 20000 }] });
    assert.equal(sold.cambio, 10000);
    assert.equal(Number((await fixture.caja.reload()).totalVentasEfectivo), 10000);
    const egreso = await request('/caja/egreso', adminToken, { sedeId: fixture.sede.id, monto: 5000,
      categoriaId: category.id, motivo: 'Prueba temporal' });
    assert.equal(egreso.status, 201, JSON.stringify(egreso.body));
    const close = await request('/caja/cierre', adminToken, { sedeId: fixture.sede.id, totalVentasEfectivo: 105000 });
    assert.equal(close.status, 200, JSON.stringify(close.body));
    assert.equal(Number(close.body.caja.diferencia), 0);
    assert.equal(Number(close.body.caja.totalVentasEfectivo), 10000);
    assert.equal(close.body.caja.estado, 'cerrada');
    const refused = await request('/ventas', adminToken, saleBody(service, { sedeId: fixture.sede.id }));
    assert.equal(refused.status, 400);
  });

  await check('CF02: dos aperturas simultáneas crean una sola caja por sede', async () => {
    const sede = await m.Sede.create({ nombre: 'Caja: apertura concurrente', direccion: 'Prueba temporal' });
    const responses = await Promise.all(Array.from({ length: 2 }, () => request('/caja/apertura', adminToken,
      { sedeId: sede.id, montoApertura: 100000 })));
    const count = await m.Caja.count({ where: { sedeId: sede.id, estado: 'abierta' } });
    assert.equal(count, 1, `Se crearon ${count} cajas; HTTP ${responses.map((r) => r.status).join(', ')}`);
  });

  await check('CF03: cierre conserva ingresos electrónicos registrados', async () => {
    const fixture = await open('Caja: cierre y tarjeta');
    await saleAt(fixture.sede);
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 10000);
    const response = await request('/caja/cierre', adminToken,
      { sedeId: fixture.sede.id, totalVentasEfectivo: 100000, totalVentasTarjeta: 0 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 10000,
      'El cierre reemplazó $10.000 cobrados por tarjeta por el valor enviado desde el navegador.');
  });

  await check('CF04: cierre rechaza efectivo contado negativo', async () => {
    const fixture = await open('Caja: cierre inválido');
    const response = await request('/caja/cierre', adminToken, { sedeId: fixture.sede.id, totalVentasEfectivo: -100 });
    assert.equal(response.status, 400, `Cierre inválido aceptado con HTTP ${response.status}`);
    assert.equal((await fixture.caja.reload()).estado, 'abierta');
  });

  await check('CF05: reporte Z rechaza caja de otra sede', async () => {
    const fixture = await open('Caja: reporte Z y sede');
    const response = await request(`/caja/${fixture.caja.id}/detalle-z`, cashToken);
    assert.equal(response.status, 403, `Reporte ajeno accesible con HTTP ${response.status}`);
  });

  await check('CF06: egreso rechaza saldo insuficiente y PIN incorrecto sin cerrar sesión', async () => {
    const fixture = await open('Caja: validación egresos', 100000);
    const missing = await request('/caja/egreso', adminToken, { sedeId: fixture.sede.id, monto: 100001,
      categoriaId: category.id, motivo: 'Temporal' });
    assert.equal(missing.status, 400);
    const invalid = await request('/caja/egreso', adminToken, { sedeId: fixture.sede.id, monto: 60000,
      categoriaId: category.id, motivo: 'Temporal', pinAdmin: 'invalid' });
    assert.equal(invalid.status, 403);
    assert.equal((await request('/auth/me', adminToken)).status, 200);
    assert.equal(Number((await fixture.caja.reload()).totalEgresos), 0);
  });

  await check('CF07: factura pagada corresponde a venta y genera PDF', async () => {
    const fixture = await open('Facturas: consulta y PDF');
    const sale = await saleAt(fixture.sede);
    const response = await request(`/facturas/${sale.facturaId}`, adminToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.estado, 'pagada');
    assert.equal(response.body.ventaId, sale.ventaId);
    assert.equal(Number(response.body.total), 10000);
    const pdf = await fetch(`${url}/facturas/${sale.facturaId}/pdf`, {
      headers: { Authorization: `Bearer ${adminToken}` }, signal: AbortSignal.timeout(15000) });
    assert.equal(pdf.status, 200);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 1000);
    assert.equal((await request(`/facturas/${sale.facturaId}`, cashToken)).status, 403);
  });

  await check('CF08: abono liquida cartera, factura, venta y caja', async () => {
    const fixture = await open('Facturas: abono y pago completo');
    const sale = await saleAt(fixture.sede, service, { esCredito: true, pagos: [{ metodo: 'efectivo', monto: 2000 }] });
    const cpc = await m.CuentaPorCobrar.findOne({ where: { facturaId: sale.facturaId } });
    assert.equal(Number(cpc.saldoPendiente), 8000);
    const response = await request(`/cartera/${cpc.id}/abono`, adminToken, { monto: 8000, metodo: 'tarjeta', sedeId: B.id });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(Number((await cpc.reload()).saldoPendiente), 0);
    assert.equal((await m.Factura.findByPk(sale.facturaId)).estado, 'pagada');
    assert.equal((await m.Venta.findByPk(sale.ventaId)).estado, 'completada');
    assert.equal(Number((await fixture.caja.reload()).totalVentasEfectivo), 2000);
    assert.equal(Number(fixture.caja.totalVentasTarjeta), 8000);
    assert.equal((await request(`/cartera/${cpc.id}/abono`, adminToken, { monto: 1, metodo: 'tarjeta' })).status, 400);
  });

  await check('CF09: anulación en la misma caja repone stock y revierte pago una vez', async () => {
    const fixture = await open('Facturas: anulación simple');
    const stock = await m.StockSede.create({ productoId: product.id, sedeId: fixture.sede.id, cantidad: 10 });
    const sale = await saleAt(fixture.sede, product);
    assert.equal((await stock.reload()).cantidad, 9);
    const response = await request(`/facturas/${sale.facturaId}/nota-credito`, adminToken, {});
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((await stock.reload()).cantidad, 10);
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 0);
    assert.equal((await m.Factura.findByPk(sale.facturaId)).estado, 'anulada');
    assert.equal((await request(`/facturas/${sale.facturaId}/nota-credito`, adminToken, {})).status, 400);
  });

  await check('CF10: anular factura antigua conserva los cobros de la nueva caja', async () => {
    const fixture = await open('Facturas: anulación entre sesiones');
    const oldSale = await saleAt(fixture.sede);
    assert.equal((await request('/caja/cierre', adminToken, { sedeId: fixture.sede.id, totalVentasEfectivo: 100000 })).status, 200);
    const newBoxResponse = await request('/caja/apertura', adminToken, { sedeId: fixture.sede.id, montoApertura: 100000 });
    assert.equal(newBoxResponse.status, 201);
    const newBox = await m.Caja.findByPk(newBoxResponse.body.id);
    await saleAt(fixture.sede);
    const response = await request(`/facturas/${oldSale.facturaId}/nota-credito`, adminToken, {});
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(Number((await newBox.reload()).totalVentasTarjeta), 10000,
      'Anular la factura antigua descontó el ingreso por tarjeta de otra venta de la caja nueva.');
  });

  await check('CF11: anulación de crédito revierte también los abonos posteriores', async () => {
    const fixture = await open('Facturas: anulación de crédito');
    const sale = await saleAt(fixture.sede, service, { esCredito: true, pagos: [{ metodo: 'efectivo', monto: 2000 }] });
    const cpc = await m.CuentaPorCobrar.findOne({ where: { facturaId: sale.facturaId } });
    assert.equal((await request(`/cartera/${cpc.id}/abono`, adminToken, { monto: 8000, metodo: 'tarjeta' })).status, 201);
    const response = await request(`/facturas/${sale.facturaId}/nota-credito`, adminToken, {});
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const abonos = await m.Abono.findAll({ where: { cuentaPorCobrarId: cpc.id } });
    assert.equal(abonos.length, 1, 'La anulación debe conservar el cobro original como historial.');
    assert.ok(abonos[0].anuladoAt);
    assert.ok((await cpc.reload()).anuladaAt);
    assert.equal(Number(cpc.saldoPendiente), 0);
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 0,
      'El ingreso del abono anulado permanece en los acumulados de caja.');
  });
  await check('CF12: reporte Z incluye los abonos de cartera de la sesión', async () => {
    const fixture = await open('Caja: detalle de abonos');
    const sale = await saleAt(fixture.sede, service, { esCredito: true, pagos: [] });
    const cpc = await m.CuentaPorCobrar.findOne({ where: { facturaId: sale.facturaId } });
    assert.equal((await request(`/cartera/${cpc.id}/abono`, adminToken, { monto: 10000, metodo: 'tarjeta' })).status, 201);
    const response = await request(`/caja/${fixture.caja.id}/detalle-z`, adminToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.detalle.abonos.length, 1, 'El reporte Z omite el abono de cartera registrado en esta caja.');
  });
  await check('CF13: reporte Z identifica pagos por tarjeta correctamente', async () => {
    const fixture = await open('Caja: detalle por medio de pago');
    const sale = await saleAt(fixture.sede);
    const response = await request(`/caja/${fixture.caja.id}/detalle-z`, adminToken);
    assert.equal(response.status, 200);
    const detail = response.body.detalle.ventas.find((row) => row.id === sale.ventaId);
    assert.ok(detail);
    assert.match(detail.medioPago.toLowerCase(), /tarjeta/, 'El reporte Z muestra como efectivo una venta pagada por tarjeta.');
  });
  await check('CF14: anulación de reparación revierte el cobro de caja', async () => {
    const fixture = await open('Facturas: anulación de reparación');
    const orden = await m.OrdenReparacion.create({ numeroOrden: await nextDocumentNumber(m.sequelize, 'OR'),
      clienteId: cliente.id, sedeId: fixture.sede.id, tipoEquipo: 'Teléfono', marca: 'Temporal', modelo: 'Prueba',
      problemaReportado: 'Auditoría temporal', estado: 'listo', costoManoObra: 10000, totalCobrado: 10000 });
    assert.equal((await request(`/reparaciones/${orden.id}/estado`, adminToken,
      { estado: 'entregado', metodoPago: 'tarjeta' }, 'PUT')).status, 200);
    const factura = await m.Factura.findOne({ where: { ordenReparacionId: orden.id } });
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 10000);
    assert.equal((await request(`/facturas/${factura.id}/nota-credito`, adminToken, {})).status, 200);
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 0,
      'La factura de reparación se anula pero conserva su cobro de $10.000 en caja.');
  });
  await check('CF15: anulación de instalación concilia orden y caja', async () => {
    const fixture = await open('Facturas: anulación de instalación');
    const orden = await m.OrdenInstalacion.create({ numeroOrden: await nextDocumentNumber(m.sequelize, 'IN'),
      clienteId: cliente.id, sedeId: fixture.sede.id, valorServicio: 10000, totalCobrado: 10000, estado: 'en_proceso' });
    const close = await request(`/instalaciones/${orden.id}/cerrar`, adminToken,
      { modoCobro: 'contado', metodoPago: 'tarjeta' });
    assert.equal(close.status, 200, JSON.stringify(close.body));
    const factura = await m.Factura.findOne({ where: { ordenInstalacionId: orden.id } });
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 10000);
    assert.equal((await request(`/facturas/${factura.id}/nota-credito`, adminToken, {})).status, 200);
    const current = await orden.reload();
    assert.equal(current.estado, 'cancelada');
    const balance = Number((await fixture.caja.reload()).totalVentasTarjeta);
    assert.equal(balance, 0, `Factura anulada pero tarjeta=${balance} y orden=${current.estado}.`);
  });
  await check('CF16: factura de instalación anulada no puede volver a cobrarse', async () => {
    const fixture = await open('Facturas: cartera de instalación anulada');
    const orden = await m.OrdenInstalacion.create({ numeroOrden: await nextDocumentNumber(m.sequelize, 'IN'),
      clienteId: cliente.id, sedeId: fixture.sede.id, valorServicio: 10000, totalCobrado: 10000, estado: 'en_proceso' });
    assert.equal((await request(`/instalaciones/${orden.id}/cerrar`, adminToken, { modoCobro: 'fiado' })).status, 200);
    const factura = await m.Factura.findOne({ where: { ordenInstalacionId: orden.id } });
    const cpc = await m.CuentaPorCobrar.findOne({ where: { facturaId: factura.id } });
    assert.equal((await request(`/facturas/${factura.id}/nota-credito`, adminToken, {})).status, 200);
    const response = await request(`/cartera/${cpc.id}/abono`, adminToken, { monto: 10000, metodo: 'tarjeta' });
    assert.notEqual(response.status, 201,
      `El abono se aceptó y la factura anulada ahora figura ${(await factura.reload()).estado}.`);
  });

  await check('CF17: cierre valida todos los importes y conserva el arqueo separado', async () => {
    const fixture = await open('Caja: importes y arqueo');
    await saleAt(fixture.sede);
    for (const extra of [{ totalVentasEfectivo: 'Infinity' }, { totalVentasEfectivo: '10abc' },
      { totalVentasTarjeta: -1 }, { totalVentasTarjeta: null }, { totalesPorMetodo: [] },
      { totalesPorMetodo: { externo: 'NaN' } }]) {
      assert.equal((await request('/caja/cierre', adminToken,
        { sedeId: fixture.sede.id, totalVentasEfectivo: 100000, ...extra })).status, 400);
      assert.equal((await fixture.caja.reload()).estado, 'abierta');
    }
    const closed = await request('/caja/cierre', adminToken, { sedeId: fixture.sede.id,
      totalVentasEfectivo: 99900, totalVentasTarjeta: 9000, totalesPorMetodo: { externo: 50 } });
    assert.equal(closed.status, 200);
    assert.equal(Number(closed.body.caja.totalVentasTarjeta), 10000);
    assert.equal(closed.body.caja.arqueoDeclarado.tarjeta, 9000);
    assert.equal(closed.body.caja.ingresosAlCierre.tarjeta, 10000);
    assert.equal(Number(closed.body.caja.diferencia), -100);
    assert.deepEqual(closed.body.caja.totalesPorMetodo, {});
  });

  await check('CF18: Z y PDF respetan sede e incluyen abonos, servicios y reversos', async () => {
    const fixture = await open('Caja: historial Z y PDF');
    const sale = await saleAt(fixture.sede, service, { esCredito: true, pagos: [{ metodo: 'efectivo', monto: 2000 }] });
    const cuenta = await m.CuentaPorCobrar.findOne({ where: { facturaId: sale.facturaId } });
    assert.equal((await request(`/cartera/${cuenta.id}/abono`, adminToken, { monto: 8000, metodo: 'tarjeta' })).status, 201);
    assert.equal((await request(`/facturas/${sale.facturaId}/nota-credito`, adminToken, {})).status, 200);
    const reporte = await request(`/caja/${fixture.caja.id}/detalle-z`, adminToken);
    assert.equal(reporte.status, 200);
    assert.equal(reporte.body.detalle.abonos.length, 1);
    assert.ok(reporte.body.detalle.abonos[0].anuladoAt);
    assert.equal(reporte.body.detalle.reversos.length, 2);
    const movimientos = await request(`/caja/movimientos?sede=${fixture.sede.id}`, adminToken);
    assert.equal(movimientos.status, 200);
    const filas = movimientos.body.items.filter((fila) => fila.tipo !== 'apertura');
    assert.equal(filas.length, 4);
    assert.equal(filas.reduce((sum, fila) => sum + (fila.direccion === 'entrada' ? fila.monto : -fila.monto), 0), 0);
    assert.equal((await request(`/caja/movimientos?sede=${fixture.sede.id}&desde=2099-01-01`, adminToken)).body.items.length, 0);
    for (const [token, status] of [[cashToken, 403], [adminToken, 200]]) {
      const pdf = await fetch(`${url}/caja/${fixture.caja.id}/reporte-z-pdf`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
      assert.equal(pdf.status, status);
      if (status === 200) assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    }
  });

  await check('CF19: anulación revierte pago y abono en sus respectivas sesiones', async () => {
    const fixture = await open('Facturas: crédito entre sesiones');
    const sale = await saleAt(fixture.sede, service, { esCredito: true, pagos: [{ metodo: 'efectivo', monto: 2000 }] });
    const cuenta = await m.CuentaPorCobrar.findOne({ where: { facturaId: sale.facturaId } });
    assert.equal((await request('/caja/cierre', adminToken, { sedeId: fixture.sede.id, totalVentasEfectivo: 102000 })).status, 200);
    const abierta = await request('/caja/apertura', adminToken, { sedeId: fixture.sede.id, montoApertura: 100000 });
    assert.equal(abierta.status, 201);
    const segunda = await m.Caja.findByPk(abierta.body.id);
    await saleAt(fixture.sede);
    assert.equal((await request(`/cartera/${cuenta.id}/abono`, adminToken, { monto: 8000, metodo: 'tarjeta' })).status, 201);
    assert.equal((await request(`/facturas/${sale.facturaId}/nota-credito`, adminToken, {})).status, 200);
    assert.equal(Number((await fixture.caja.reload()).totalVentasEfectivo), 0);
    assert.equal(fixture.caja.ingresosAlCierre.efectivo, 2000);
    assert.equal(fixture.caja.arqueoDeclarado.efectivo, 102000);
    assert.equal(Number((await segunda.reload()).totalVentasTarjeta), 10000);
    assert.equal((await m.Abono.findOne({ where: { cuentaPorCobrarId: cuenta.id } })).cajaId, segunda.id);
  });

  await check('CF20: abono concurrente con anulación no reactiva factura ni pierde dinero', async () => {
    const fixture = await open('Facturas: abono y anulación concurrentes');
    const sale = await saleAt(fixture.sede, service, { esCredito: true, pagos: [] });
    const cuenta = await m.CuentaPorCobrar.findOne({ where: { facturaId: sale.facturaId } });
    const [abono, anulacion] = await Promise.all([
      request(`/cartera/${cuenta.id}/abono`, adminToken, { monto: 10000, metodo: 'tarjeta' }),
      request(`/facturas/${sale.facturaId}/nota-credito`, adminToken, {})
    ]);
    assert.equal(anulacion.status, 200, JSON.stringify(anulacion.body));
    assert.ok([201, 400].includes(abono.status), JSON.stringify(abono.body));
    assert.equal((await m.Factura.findByPk(sale.facturaId)).estado, 'anulada');
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 0);
    assert.equal(Number((await cuenta.reload()).saldoPendiente), 0);
    assert.equal((await request(`/cartera/${cuenta.id}/abono`, adminToken, { monto: 1, metodo: 'tarjeta' })).status, 400);
  });

  await check('CF21: servicio con pagos mixtos conserva efectivo neto y revierte exactamente', async () => {
    const fixture = await open('Facturas: reparación con cambio');
    const orden = await m.OrdenReparacion.create({ numeroOrden: await nextDocumentNumber(m.sequelize, 'OR'),
      clienteId: cliente.id, sedeId: fixture.sede.id, tipoEquipo: 'Teléfono', marca: 'Temporal', modelo: 'Prueba',
      problemaReportado: 'Temporal', estado: 'listo', costoManoObra: 10000, totalCobrado: 10000 });
    assert.equal((await request(`/reparaciones/${orden.id}/estado`, adminToken,
      { estado: 'entregado', pagos: { efectivo: 10000, tarjeta: 5000 } }, 'PUT')).status, 200);
    const factura = await m.Factura.findOne({ where: { ordenReparacionId: orden.id } });
    assert.deepEqual(factura.pagosCaja, [{ metodo: 'efectivo', monto: 5000 }, { metodo: 'tarjeta', monto: 5000 }]);
    const reporte = await request(`/caja/${fixture.caja.id}/detalle-z`, adminToken);
    assert.equal(reporte.body.detalle.servicios.length, 1);
    assert.equal(reporte.body.detalle.servicios[0].totalCobrado, 10000);
    assert.equal((await request(`/facturas/${factura.id}/nota-credito`, adminToken, {})).status, 200);
    assert.equal(Number((await fixture.caja.reload()).totalVentasEfectivo), 0);
    assert.equal(Number(fixture.caja.totalVentasTarjeta), 0);
  });

  await check('CF22: instalación anulada repone material y serial una sola vez', async () => {
    const fixture = await open('Facturas: inventario de instalación');
    const equipo = await m.Producto.create({ nombre: 'Equipo instalación temporal', codigoBarras: 'CF22-SER',
      categoriaId: product.categoriaId, precioVenta: 10000, precioCosto: 5000, tieneNumeroSerie: true });
    const stock = await m.StockSede.create({ productoId: equipo.id, sedeId: fixture.sede.id, cantidad: 1 });
    const serie = await m.NumeroSerie.create({ productoId: equipo.id, sedeId: fixture.sede.id, serie: 'CF22-IMEI', estado: 'en_stock' });
    const orden = await m.OrdenInstalacion.create({ numeroOrden: await nextDocumentNumber(m.sequelize, 'IN'),
      clienteId: cliente.id, sedeId: fixture.sede.id, valorServicio: 10000, totalCobrado: 10000, estado: 'en_proceso' });
    assert.equal((await request(`/instalaciones/${orden.id}/materiales`, adminToken,
      { productoId: equipo.id, cantidad: 1, series: [serie.serie] })).status, 201);
    assert.equal((await request(`/instalaciones/${orden.id}/cerrar`, adminToken,
      { modoCobro: 'contado', metodoPago: 'tarjeta' })).status, 200);
    const factura = await m.Factura.findOne({ where: { ordenInstalacionId: orden.id } });
    assert.equal((await request(`/facturas/${factura.id}/nota-credito`, adminToken, {})).status, 200);
    assert.equal((await stock.reload()).cantidad, 1);
    assert.equal((await serie.reload()).estado, 'en_stock');
    assert.equal((await request(`/facturas/${factura.id}/nota-credito`, adminToken, {})).status, 400);
    assert.equal((await stock.reload()).cantidad, 1);
  });

  await check('CF24: medios personalizados se revierten y financiación diferida no descuenta caja', async () => {
    const config = await m.ConfiguracionSistema.findOne();
    const originales = config.mediosPago;
    await config.update({ mediosPago: [...originales,
      { id: 'bono_cf24', nombre: 'Bono temporal', activo: true },
      { id: 'financiador_cf24', nombre: 'Financiador temporal', activo: true, recaudoDiferido: true }] });
    try {
      const fixture = await open('Facturas: métodos extras y financiación');
      const bono = await saleAt(fixture.sede, service, { pagos: [{ metodo: 'bono_cf24', monto: 10000 }] });
      assert.equal((await fixture.caja.reload()).totalesPorMetodo.bono_cf24, 10000);
      const financiada = await saleAt(fixture.sede, service, { pagos: [{ metodo: 'financiador_cf24', monto: 10000 }] });
      assert.deepEqual((await m.Factura.findByPk(financiada.facturaId)).pagosCaja, []);
      assert.equal((await request(`/facturas/${financiada.facturaId}/nota-credito`, adminToken, {})).status, 200);
      assert.equal((await fixture.caja.reload()).totalesPorMetodo.bono_cf24, 10000);
      assert.equal((await request(`/facturas/${bono.facturaId}/nota-credito`, adminToken, {})).status, 200);
      assert.equal((await fixture.caja.reload()).totalesPorMetodo.bono_cf24, 0);
    } finally { await config.update({ mediosPago: originales }); }
  });

  await check('CF25: cobro POS histórico identifica sesión y rechaza acumulado inconsistente', async () => {
    const fixture = await open('Facturas: sesión histórica');
    const sale = await saleAt(fixture.sede);
    const factura = await m.Factura.findByPk(sale.facturaId);
    await factura.update({ cajaId: null, pagosCaja: null });
    assert.equal((await request('/caja/cierre', adminToken, { sedeId: fixture.sede.id, totalVentasEfectivo: 100000 })).status, 200);
    assert.equal((await request('/caja/apertura', adminToken, { sedeId: fixture.sede.id, montoApertura: 100000 })).status, 201);
    await saleAt(fixture.sede);
    await fixture.caja.update({ totalVentasTarjeta: 0 });
    assert.equal((await request(`/facturas/${factura.id}/nota-credito`, adminToken, {})).status, 409);
    assert.equal((await factura.reload()).estado, 'pagada');
    await fixture.caja.update({ totalVentasTarjeta: 10000 });
    assert.equal((await request(`/facturas/${factura.id}/nota-credito`, adminToken, {})).status, 200);
    assert.equal((await factura.reload()).cajaId, fixture.caja.id);
    assert.equal(Number((await fixture.caja.reload()).totalVentasTarjeta), 0);
    const nueva = await m.Caja.findOne({ where: { sedeId: fixture.sede.id, estado: 'abierta' } });
    assert.equal(Number(nueva.totalVentasTarjeta), 10000);
  });

  await check('CF23: migración de caja es aditiva e idempotente sobre tablas existentes', async () => {
    const migrar = require('../../backend/migrations/caja-facturas-2026-10').migrateCajaFacturasSchema;
    await m.sequelize.query('ALTER TABLE "Cajas" DROP COLUMN "arqueoDeclarado"');
    await m.sequelize.query('ALTER TABLE "Abonos" DROP COLUMN "anuladoAt"');
    await migrar(m.sequelize); await migrar(m.sequelize);
    assert.ok((await m.sequelize.getQueryInterface().describeTable('Cajas')).arqueoDeclarado);
    assert.ok((await m.sequelize.getQueryInterface().describeTable('Abonos')).anuladoAt);
  });
};
