import type { ProductoDTO, CajaDTO, CajaReporte, PagoInput } from '../../../../shared/contracts';
import type { EmpresaDocumento } from './documents.js';
import type { MedioPago } from './finance.js';
export interface ComboComponenteDTO { cantidad: number; nombre?: string; producto?: ProductoDTO | null; }
export interface ProductoPos extends ProductoDTO { autoDetectedImei?: string; stocks?: { cantidad: number }[]; componentes?: ComboComponenteDTO[]; }
export interface StockPos { productoId: string; cantidad: number; producto: ProductoPos; }
export type CajaPos = (CajaDTO & { usuarioApertura?: { nombre: string } | null }) | Extract<CajaReporte, { estado: 'sin_registro' }>;
export interface PosConfig extends EmpresaDocumento { descuentoMaximoPct: string; cobrarIvaPos?: boolean; cajaCompartidaSede?: boolean; mediosPago?: MedioPago[]; }
export interface CartItem {
  productoId: string | null; nombre: string; codigoBarras: string; precioBase: number; precioModificado: number;
  precioCosto: number; descuentoPct: number; cantidad: number; tieneNumeroSerie: boolean; imei: string | null;
  subtotal: number; unidadMedida?: 'und' | 'm'; esServicio?: boolean; tieneIVA?: boolean; esCombo?: boolean;
  componentes?: ComboComponenteDTO[]; disponibilidadCombo?: number | null; imagenUrl?: string | null; pinAdmin?: string;
}
export interface SaleBody {
  clienteId: string | null; sedeId: string | null; subtotal: number; descuentoTotal: number; iva: number;
  total: number; esCredito: boolean; observaciones: string; pagos: PagoInput[]; pinAdmin: string | null;
  items: { productoId: string | null; cantidad: number; precioBase: number; precioModificado: number; descuentoPct: number; imei: string | null }[];
  idempotencyKey?: string; cambio?: number;
}
export interface CotizacionPos { id: string; clienteId: string | null; items: { productoId: string | null; descripcion: string; producto?: ProductoDTO | null; precioUnitario: string; cantidad: number }[]; }
export interface TradeInPos { id: string; ventaId: string | null; valoracion: string; marca: string; modelo: string; imei: string | null; }
