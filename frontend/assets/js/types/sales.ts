import type { VentaDTO, ProductoDTO, ClienteDTO, SedeDTO } from '../../../../shared/contracts';
export interface VentaItemDTO { id: string; cantidad: number; cantidadDevuelta: number; precioBase: string; precioModificado: string; descuentoPct: string; producto?: ProductoDTO | null; }
export interface VentaDetalleDTO extends VentaDTO { createdAt: string; cliente?: ClienteDTO | null; sede?: SedeDTO | null; usuario?: { nombre: string } | null; pagos?: { metodo: string; monto: string }[]; items?: VentaItemDTO[]; }
export interface DevolucionDTO { numero: string; createdAt: string; venta?: VentaDetalleDTO; usuario?: { nombre: string }; total: number; metodoReembolso: string; motivo: string; items?: { cantidad: number; producto?: ProductoDTO; montoLinea: number }[]; }
export interface ComisionesDTO { totalComisiones: number; comisiones: { vendedor: string; numeroVenta: string; fecha: string; totalVenta: number; comision: number }[]; }
export interface DescuentoDTO extends VentaItemDTO { venta?: VentaDetalleDTO | null; }
export interface ReparacionVentaDTO { numeroOrden: string; createdAt: string; estado: string; cliente?: { nombre: string }; tecnico?: { nombre: string }; sede?: { nombre: string }; costoManoObra: string; costoRepuestos: string; totalCobrado: string; }
