const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const {
  sequelize,
  Sede,
  Usuario,
  Categoria,
  Producto,
  StockSede,
  NumeroSerie,
  Caja,
  Venta,
  ItemVenta,
  ItemVentaComponente,
  PagoVenta,
  Factura,
  MovimientoInventario,
  DevolucionVenta,
  ItemDevolucion,
  ComboComponente,
  AuditLog
} = require('../models');
const {
  validateComboComponents,
  replaceComboComponents,
  getComboAvailability
} = require('../utils/combo');

const RUN_DB_TESTS = process.env.RUN_DB_TESTS === '1';
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api';

async function api(path, token, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${body.error || response.statusText}`);
  }
  return body;
}

test('combo: disponibilidad, venta, snapshot y devolución completa', { skip: !RUN_DB_TESTS }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const created = {
    productIds: [],
    ventaId: null,
    devolucionId: null,
    concurrentVentaId: null,
    concurrentDevolucionId: null,
    facturaId: null,
    categoryId: null,
    cajaId: null,
    cajaTotals: null
  };

  try {
    const caja = await Caja.findOne({ where: { estado: 'abierta' }, order: [['createdAt', 'DESC']] });
    assert.ok(caja, 'Se necesita una caja abierta para la prueba de integración.');
    const sede = await Sede.findByPk(caja.sedeId);
    const usuario = await Usuario.findByPk(caja.usuarioAperturaId);
    assert.ok(sede && usuario, 'La caja debe tener sede y usuario de apertura.');
    created.cajaId = caja.id;
    created.cajaTotals = {
      totalVentasEfectivo: caja.totalVentasEfectivo,
      totalVentasNequi: caja.totalVentasNequi,
      totalVentasDaviplata: caja.totalVentasDaviplata,
      totalVentasTarjeta: caja.totalVentasTarjeta,
      totalVentasTransferencia: caja.totalVentasTransferencia,
      totalEgresos: caja.totalEgresos,
      totalesPorMetodo: caja.totalesPorMetodo
    };

    const token = jwt.sign({
      userId: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      sedeId: sede.id,
      sessionVersion: usuario.sessionVersion
    }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const admin = await Usuario.findOne({ where: { activo: true, rol: ['admin', 'superadmin'] } });
    assert.ok(admin, 'Se necesita un administrador activo para probar la creación del combo por API.');
    const adminToken = jwt.sign({
      userId: admin.id,
      nombre: admin.nombre,
      rol: admin.rol,
      sedeId: admin.sedeId,
      sessionVersion: admin.sessionVersion
    }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const categoria = await Categoria.create({ nombre: `__TEST_COMBO_${suffix}`, descripcion: 'Fixture temporal' });
    created.categoryId = categoria.id;

    const [consola, control, cables] = await Promise.all([
      Producto.create({
        nombre: `__TEST_CONSOLA_${suffix}`, codigoBarras: `TC-${suffix}-1`, precioVenta: 800000,
        precioCosto: 400000, tieneIVA: true, tieneNumeroSerie: true, categoriaId: categoria.id
      }),
      Producto.create({
        nombre: `__TEST_CONTROL_${suffix}`, codigoBarras: `TC-${suffix}-2`, precioVenta: 250000,
        precioCosto: 100000, tieneIVA: true, categoriaId: categoria.id
      }),
      Producto.create({
        nombre: `__TEST_CABLES_${suffix}`, codigoBarras: `TC-${suffix}-3`, precioVenta: 100000,
        precioCosto: 50000, tieneIVA: true, categoriaId: categoria.id
      })
    ]);
    created.productIds = [consola.id, control.id, cables.id];

    await StockSede.bulkCreate([
      { productoId: consola.id, sedeId: sede.id, cantidad: 2 },
      { productoId: control.id, sedeId: sede.id, cantidad: 4 },
      { productoId: cables.id, sedeId: sede.id, cantidad: 2 }
    ]);
    await NumeroSerie.bulkCreate([
      { serie: `SER-${suffix}-1`, productoId: consola.id, sedeId: sede.id, estado: 'en_stock' },
      { serie: `SER-${suffix}-2`, productoId: consola.id, sedeId: sede.id, estado: 'en_stock' }
    ]);

    const componentes = [
      { productoId: consola.id, cantidad: 1 },
      { productoId: control.id, cantidad: 2 },
      { productoId: cables.id, cantidad: 1 }
    ];
    const validated = await validateComboComponents({ componentes });
    assert.equal(validated.precioCosto, 650000);
    const comboResponse = await api('/productos', adminToken, {
      method: 'POST',
      body: JSON.stringify({
        nombre: `__TEST_COMBO_${suffix}`,
        codigoBarras: `TC-${suffix}-4`,
        descripcion: 'Combo temporal de integración',
        precioVenta: 1200000,
        precioCosto: 1,
        tieneIVA: true,
        stockMinimo: 0,
        tieneNumeroSerie: false,
        esReacondicionado: false,
        esServicio: false,
        esCombo: true,
        unidadMedida: 'und',
        categoriaId: categoria.id,
        componentes
      })
    });
    const combo = await Producto.findByPk(comboResponse.id);
    assert.ok(combo?.esCombo);
    assert.equal(Number(combo.precioCosto), 650000);
    created.productIds.push(combo.id);

    const disponibilidad = await getComboAvailability(combo.id, sede.id);
    assert.equal(disponibilidad.cantidad, 2);

    await assert.rejects(
      api('/ventas', token, {
        method: 'POST',
        body: JSON.stringify({
          sedeId: sede.id,
          subtotal: 3600000,
          descuentoTotal: 0,
          iva: 684000,
          total: 4284000,
          esCredito: false,
          items: [{
            productoId: combo.id,
            cantidad: 3,
            precioBase: 1200000,
            precioModificado: 1200000,
            descuentoPct: 0,
            imei: ''
          }],
          pagos: [{ metodo: 'tarjeta', monto: 4284000 }],
          idempotencyKey: `test-combo-insuficiente-${suffix}`
        })
      }),
      /400.*stock/i
    );
    assert.equal(await Venta.count({ where: { idempotencyKey: `test-combo-insuficiente-${suffix}` } }), 0);

    const ventaConcurrenteBody = (key) => ({
      sedeId: sede.id,
      subtotal: 2400000,
      descuentoTotal: 0,
      iva: 456000,
      total: 2856000,
      esCredito: false,
      observaciones: 'Prueba concurrente de combo',
      items: [{
        productoId: combo.id,
        cantidad: 2,
        precioBase: 1200000,
        precioModificado: 1200000,
        descuentoPct: 0,
        imei: ''
      }],
      pagos: [{ metodo: 'tarjeta', monto: 2856000 }],
      idempotencyKey: key
    });
    const carreras = await Promise.allSettled([
      api('/ventas', token, {
        method: 'POST',
        body: JSON.stringify(ventaConcurrenteBody(`test-combo-race-a-${suffix}`))
      }),
      api('/ventas', token, {
        method: 'POST',
        body: JSON.stringify(ventaConcurrenteBody(`test-combo-race-b-${suffix}`))
      })
    ]);
    const exitosas = carreras.filter((result) => result.status === 'fulfilled');
    const rechazadas = carreras.filter((result) => result.status === 'rejected');
    assert.equal(exitosas.length, 1, 'Solo una caja debe poder reservar los componentes disponibles.');
    assert.equal(rechazadas.length, 1, 'La segunda caja debe recibir stock insuficiente.');
    assert.match(rechazadas[0].reason.message, /400.*stock/i);

    created.concurrentVentaId = exitosas[0].value.ventaId;
    const concurrentItem = await ItemVenta.findOne({ where: { ventaId: created.concurrentVentaId } });
    const concurrentReturn = await api(`/ventas/${created.concurrentVentaId}/devolucion`, token, {
      method: 'POST',
      body: JSON.stringify({
        motivo: 'Restaurar fixture concurrente',
        metodoReembolso: 'tarjeta',
        items: [{ itemVentaId: concurrentItem.id, cantidad: 2 }]
      })
    });
    created.concurrentDevolucionId = concurrentReturn.devolucion.id;
    assert.equal(Number((await StockSede.findOne({ where: { productoId: consola.id, sedeId: sede.id } })).cantidad), 2);
    assert.equal(Number((await StockSede.findOne({ where: { productoId: control.id, sedeId: sede.id } })).cantidad), 4);
    assert.equal(Number((await StockSede.findOne({ where: { productoId: cables.id, sedeId: sede.id } })).cantidad), 2);

    const ventaResponse = await api('/ventas', token, {
      method: 'POST',
      body: JSON.stringify({
        sedeId: sede.id,
        subtotal: 1200000,
        descuentoTotal: 0,
        iva: 228000,
        total: 1428000,
        esCredito: false,
        observaciones: 'Prueba automatizada de combo',
        items: [{
          productoId: combo.id,
          cantidad: 1,
          precioBase: 1200000,
          precioModificado: 1200000,
          descuentoPct: 0,
          imei: ''
        }],
        pagos: [{ metodo: 'tarjeta', monto: 1428000 }],
        idempotencyKey: `test-combo-${suffix}`
      })
    });
    created.ventaId = ventaResponse.ventaId;
    created.facturaId = ventaResponse.facturaId;

    const itemVenta = await ItemVenta.findOne({ where: { ventaId: created.ventaId } });
    assert.ok(itemVenta);
    const snapshots = await ItemVentaComponente.findAll({
      where: { itemVentaId: itemVenta.id },
      order: [['productoId', 'ASC']]
    });
    assert.equal(snapshots.length, 3);
    assert.equal(snapshots.reduce((sum, row) => sum + Number(row.cantidad), 0), 4);
    assert.equal(snapshots.filter((row) => row.numeroSerieId).length, 1);

    assert.equal(Number((await StockSede.findOne({ where: { productoId: consola.id, sedeId: sede.id } })).cantidad), 1);
    assert.equal(Number((await StockSede.findOne({ where: { productoId: control.id, sedeId: sede.id } })).cantidad), 2);
    assert.equal(Number((await StockSede.findOne({ where: { productoId: cables.id, sedeId: sede.id } })).cantidad), 1);

    // Cambiar el combo después de vender: la devolución debe respetar el snapshot original (2 controles).
    await replaceComboComponents(combo.id, [
      { productoId: consola.id, cantidad: 1 },
      { productoId: control.id, cantidad: 1 }
    ]);

    const devolucionResponse = await api(`/ventas/${created.ventaId}/devolucion`, token, {
      method: 'POST',
      body: JSON.stringify({
        motivo: 'Prueba automatizada',
        metodoReembolso: 'tarjeta',
        items: [{ itemVentaId: itemVenta.id, cantidad: 1 }]
      })
    });
    created.devolucionId = devolucionResponse.devolucion.id;

    assert.equal(Number((await StockSede.findOne({ where: { productoId: consola.id, sedeId: sede.id } })).cantidad), 2);
    assert.equal(Number((await StockSede.findOne({ where: { productoId: control.id, sedeId: sede.id } })).cantidad), 4);
    assert.equal(Number((await StockSede.findOne({ where: { productoId: cables.id, sedeId: sede.id } })).cantidad), 2);
    assert.equal(await NumeroSerie.count({
      where: { productoId: consola.id, sedeId: sede.id, estado: 'en_stock' }
    }), 2);
    assert.equal(await ItemVentaComponente.count({ where: { itemVentaId: itemVenta.id, devuelto: true } }), 3);
  } finally {
    // Limpieza exacta de los fixtures; no toca productos ni ventas reales.
    const devolucionIds = [created.devolucionId, created.concurrentDevolucionId].filter(Boolean);
    const ventaIds = [created.ventaId, created.concurrentVentaId].filter(Boolean);
    if (devolucionIds.length) {
      await ItemDevolucion.destroy({ where: { devolucionId: devolucionIds } });
      await DevolucionVenta.destroy({ where: { id: devolucionIds } });
    }
    if (ventaIds.length) {
      const itemIds = (await ItemVenta.findAll({ where: { ventaId: ventaIds }, attributes: ['id'] })).map((row) => row.id);
      if (itemIds.length) await ItemVentaComponente.destroy({ where: { itemVentaId: itemIds } });
      await PagoVenta.destroy({ where: { ventaId: ventaIds } });
      await Factura.destroy({ where: { ventaId: ventaIds } });
      await ItemVenta.destroy({ where: { ventaId: ventaIds } });
      await MovimientoInventario.destroy({ where: { referenciaId: [...ventaIds, ...devolucionIds] } });
      await Venta.destroy({ where: { id: ventaIds } });
    }
    if (created.productIds.length) {
      await NumeroSerie.destroy({ where: { productoId: created.productIds } });
      await ComboComponente.destroy({ where: { comboId: created.productIds } });
      await StockSede.destroy({ where: { productoId: created.productIds } });
      await Producto.destroy({ where: { id: created.productIds }, force: true });
    }
    if (created.categoryId) await Categoria.destroy({ where: { id: created.categoryId } });
    if (ventaIds.length || devolucionIds.length) {
      await AuditLog.destroy({ where: { registroId: [...ventaIds, ...devolucionIds] } });
    }
    if (created.cajaId && created.cajaTotals) {
      await Caja.update(created.cajaTotals, { where: { id: created.cajaId } });
    }
    await sequelize.close();
  }
});
