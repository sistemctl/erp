import type { CajaDTO, SedeDTO } from '../../../../shared/contracts.js';
import type { CierreTicketData } from './documents.js';
export type CajaDetalle = CajaDTO & {
 createdAt: string; updatedAt: string; horaCierre: string | null; observaciones: string | null; diferencia: string;
 usuarioApertura?: {nombre: string}; usuarioCierre?: {nombre: string}; sede?: SedeDTO;
 arqueoDeclarado?: Record<string, number> | null; ingresosAlCierre?: Record<string, number> | null;
};
export type CajaEstado = CajaDetalle | {estado: 'sin_registro'; id?: undefined};
export type ReporteZ = Omit<CierreTicketData,'caja'> & {caja: CajaDetalle};
export interface EgresoCaja {requirioPin: boolean; id: string; createdAt: string; monto: string; motivo: string; categoria?: {nombre: string} | null; usuario?: {nombre: string} | null;}
export interface MovimientoOrigen { modulo?: string; documento?: string; tercero?: string; sede?: string; autorizador?: string; totalOperacion?: number; ruta?: string; pagos?: {medio: string; monto: number}[]; items?: {nombre: string; cantidad: number}[]; }
export interface MovimientoCaja {id: string; direccion: 'entrada'|'salida'; concepto: string; referencia: string; detalle: string; monto: number; medioPago: string; responsable: string; fecha: string; origen?: MovimientoOrigen;}
export interface MovimientosCaja {items: MovimientoCaja[]; pagination: {page: number; totalPages: number; total: number};}

