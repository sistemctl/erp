import type { ClienteDTO } from '../../../../shared/contracts';
export interface CuentaDTO {
  id: string; cliente?: ClienteDTO | null;
  factura?: { numeroFactura: string; sedeId: string; sede?: { nombre: string } | null } | null;
  fechaVencimiento: string; saldoPendiente: string; totalOriginal: string; totalAbonado: string;
  estado: string; diasVencido: number; semaforo: string; pagadorExterno?: string | null; esRecaudoExterno?: boolean;
}
export interface CarteraResumen { items: CuentaDTO[]; totalPendiente: number; totalVencida: number; totalAlDia: number; }
export interface CuentaPagarDTO { id: string; numeroOrden: string; proveedor?: { nombre: string } | null; fechaVencimientoPago: string | null; saldoPendiente: string; diasVencido: number; }
export interface CuentasPagarResumen { items: CuentaPagarDTO[]; totalSaldo: number; }
export interface FlujoCaja { ingresos: number; egresosTotal: number; neto: number; serie: { fecha: string; ingresos: number }[]; }
export interface MetodoVentaResumen { metodo: string; total: number; }
export interface ProductoVentaResumen { nombre: string; unidades: number; ingresos: number; }
export interface InventarioValorizado { valorCosto: number; valorVenta: number; margenPotencial: number; items: { nombre: string; sede: string; cantidad: number; valorCosto: number; valorVenta: number }[]; }
export interface MedioPago { id: string; nombre: string; activo?: boolean; recaudoDiferido?: boolean; }
