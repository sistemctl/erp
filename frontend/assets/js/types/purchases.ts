import type { OrdenCompraColumns, ItemOrdenCompraColumns, PagoCompraColumns } from './model-columns.js';
import type { ProductoDTO, ProveedorDTO, SedeDTO } from '../../../../shared/contracts.js';
export type CompraDTO = OrdenCompraColumns & {proveedor?: ProveedorDTO | null; sede?: SedeDTO | null; usuario?: {nombre: string} | null; pagos?: PagoCompraColumns[]; items: (ItemOrdenCompraColumns & {producto: ProductoDTO})[]};
/** Compra por rollo: se conserva el costo real del rollo para que el total coincida al centavo con la factura. */
export interface RolloCompra {costoTotalRollo: string; metrosPorRollo: number; cantidadRollos: number;}
export interface CompraCart {productoId: string; nombre: string; cantidadPedida: number; precioUnitario: number; unidadMedida?: 'm' | 'und'; rollo?: RolloCompra | null;}
export interface RecepcionCompra {productoId: string; cantidadRecibida: number; series: string[];}
export interface DevolucionCompra {productoId: string; cantidadDevolver: number; series: string[];}
