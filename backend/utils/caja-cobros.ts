import type { Attributes, Transaction } from 'sequelize';
import type CajaModel = require('../models/Caja');
import type FacturaModel = require('../models/Factura');
import type { PagoCaja } from '../types/model-json';
import models = require('../models');
const { Caja, Factura, Venta, PagoVenta, CuentaPorCobrar, Abono } = models;
import { Op } from 'sequelize';
import { httpError } from './http-error';

export const campos: Record<string, keyof Pick<CajaModel, "totalVentasEfectivo" | "totalVentasNequi" | "totalVentasDaviplata" | "totalVentasTarjeta" | "totalVentasTransferencia">> = {
  efectivo: 'totalVentasEfectivo', nequi: 'totalVentasNequi', daviplata: 'totalVentasDaviplata',
  tarjeta: 'totalVentasTarjeta', transferencia: 'totalVentasTransferencia'
};
const redondear = (monto: unknown) => Math.round((Number(monto) + Number.EPSILON) * 100) / 100;

export function pagosServicio(total: unknown, pagos: Record<string, unknown> | null | undefined, metodo = 'efectivo', credito = false): PagoCaja[] {
  const desglose = pagos ? Object.keys(campos).map((metodo) => ({ metodo, monto: Number(pagos[metodo] ?? 0) }))
    : [{ metodo, monto: Number(total) }];
  if (!desglose.every((p) => campos[p.metodo] && Number.isFinite(p.monto) && p.monto >= 0)) {
    throw httpError(400, 'Los montos de pago deben ser finitos y no negativos.');
  }
  const recibido = redondear(desglose.reduce((sum, p) => sum + p.monto, 0));
  if (!credito && recibido < Number(total) - 0.01) throw httpError(400, 'El pago no cubre el total.');
  const cambio = redondear(Math.max(0, recibido - Number(total)));
  const efectivo = desglose.find((p) => p.metodo === 'efectivo');
  if (cambio > (efectivo?.monto || 0)) throw httpError(400, 'El exceso de pago supera el efectivo recibido.');
  if (efectivo) efectivo.monto = redondear(efectivo.monto - cambio);
  return desglose.filter((p) => p.monto > 0);
}

// Sólo se recupera una sesión histórica si existe una candidata inequívoca.
export async function cajaHistorica(sedeId: string, fecha: Date, transaction?: Transaction) {
  const cajas = await Caja.findAll({ where: {
    sedeId, createdAt: { [Op.lte]: fecha },
    [Op.or]: [{ horaCierre: { [Op.gte]: fecha } }, { estado: 'abierta' }]
  }, transaction });
  if (cajas.length !== 1) throw httpError(409, 'No se puede identificar la caja original del cobro histórico. Regularice su sesión antes de anular.');
  return cajas[0].id;
}

export async function revertirCobrosFactura(factura: FacturaModel, transaction: Transaction) {
  const cuenta = await CuentaPorCobrar.findOne({ where: { facturaId: factura.id }, transaction, lock: transaction.LOCK.UPDATE });
  const abonos = cuenta ? await Abono.findAll({ where: { cuentaPorCobrarId: cuenta.id, anuladoAt: null }, transaction }) : [];
  let pagos = factura.pagosCaja;
  let cajaId = factura.cajaId;
  if (pagos === null || pagos === undefined) {
    if (factura.ventaId) {
      const venta = await Venta.findByPk(factura.ventaId, { transaction });
      const originales = await PagoVenta.findAll({ where: { ventaId: factura.ventaId }, transaction });
      // Los medios antiguos externos no prueban que haya entrado dinero a caja.
      if (originales.some((p) => !campos[p.metodo] && p.metodo !== 'trade_in')) {
        throw httpError(409, 'El cobro histórico tiene medios sin conciliación de caja. Regularícelo antes de anular.');
      }
      pagos = originales.filter((p) => campos[p.metodo]).map((p) => ({ metodo: p.metodo, monto: Number(p.monto) }));
      if (pagos.some((p) => p.monto > 0)) cajaId = await cajaHistorica(factura.sedeId, venta?.createdAt || factura.createdAt, transaction);
    } else {
      const inicial = cuenta ? Number(cuenta.totalAbonado) - abonos.reduce((sum, a) => sum + Number(a.monto), 0) : Number(factura.total);
      if (inicial > 0.01) throw httpError(409, 'Esta factura histórica no conserva el desglose del cobro. Regularícelo antes de anular.');
      pagos = [];
    }
    await factura.update({ cajaId, pagosCaja: pagos }, { transaction });
  }
  const porCaja = new Map<string, Record<string, number>>();
  function agregar(id: string | null, metodo: string, monto: unknown) {
    if (!id) throw httpError(409, 'El cobro no conserva su caja original.');
    const medios = porCaja.get(id) || {};
    medios[metodo] = redondear((medios[metodo] || 0) + Number(monto));
    porCaja.set(id, medios);
  }
  for (const pago of pagos) if (Number(pago.monto) > 0) agregar(cajaId, pago.metodo, pago.monto);
  for (const abono of abonos) {
    if (!abono.cajaId) await abono.update({ cajaId: await cajaHistorica(factura.sedeId, abono.createdAt, transaction) }, { transaction });
    agregar(abono.cajaId, abono.metodo, abono.monto);
  }
  // Orden estable para evitar bloqueos cruzados cuando una factura abarca varias cajas.
  for (const id of [...porCaja.keys()].sort()) {
    const caja = await Caja.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!caja || caja.sedeId !== factura.sedeId) throw httpError(409, 'La caja original no corresponde a la sede de la factura.');
    const cambios: Partial<Attributes<CajaModel>> = {}, extras = { ...(caja.totalesPorMetodo || {}) };
    for (const [metodo, monto] of Object.entries(porCaja.get(id) || {})) {
      const campo = campos[metodo];
      const saldo = redondear(Number(campo ? caja[campo] : extras[metodo] || 0) - monto);
      if (saldo < -0.01) throw httpError(409, 'Los acumulados de la caja original no concilian con los cobros. Regularícelos antes de anular.');
      if (campo) cambios[campo] = Math.max(0, saldo);
      else extras[metodo] = Math.max(0, saldo);
    }
    await caja.update({ ...cambios, totalesPorMetodo: extras }, { transaction });
  }
  const fecha = new Date();
  for (const abono of abonos) await abono.update({ anuladoAt: fecha }, { transaction });
  if (cuenta) await cuenta.update({ saldoPendiente: 0, anuladaAt: fecha }, { transaction });
  await factura.update({ cajaRevertidaAt: fecha }, { transaction });
}

