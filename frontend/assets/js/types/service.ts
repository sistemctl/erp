import type { OrdenReparacionColumns, FotoReparacionColumns, RepuestoOrdenColumns, OrdenInstalacionColumns, MaterialInstalacionColumns } from './model-columns.js';
import type { ClienteDTO, ProductoDTO, SedeDTO } from '../../../../shared/contracts.js';
export interface TecnicoServicio { id: string; nombre: string; }
export type RepuestoServicio = RepuestoOrdenColumns & { producto?: ProductoDTO | null };
export type ReparacionServicio = OrdenReparacionColumns & {
 cliente?: ClienteDTO | null; tecnico?: TecnicoServicio | null; sede?: SedeDTO | null;
 repuestos?: RepuestoServicio[]; fotos?: FotoReparacionColumns[]; facturada?: boolean;
};
export interface CampoGuardado { id: string; value: string; checked?: boolean; }
export type InstalacionServicio = OrdenInstalacionColumns & {
 cliente?: ClienteDTO | null; tecnico?: TecnicoServicio | null; sede?: SedeDTO | null;
 materiales?: (Omit<MaterialInstalacionColumns, 'series'> & {series: string[] | null; producto?: ProductoDTO | null})[];
 factura?: {numeroFactura: string; estado: string} | null;
};
export type CobroInstalacion = {modoCobro: 'fiado'} | {modoCobro: 'contado'; pagos: Record<'efectivo' | 'nequi' | 'daviplata' | 'tarjeta' | 'transferencia', number>};
