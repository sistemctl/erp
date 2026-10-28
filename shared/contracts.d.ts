/** Contratos de transporte; no convierten ni validan datos recibidos. */
export type UUID = string;
export type DecimalText = string;
export type DateOnly = string;
export type IsoDateTime = string;
export type Role = 'superadmin' | 'admin' | 'gerente_sede' | 'cajero' | 'tecnico' | 'contador';
export interface SessionUser { id: UUID; nombre: string; rol: Role; sedeId: UUID | null; email?: string; sedeNombre?: string; }
export interface UserDTO extends SessionUser { email: string; sedeNombre: string; }
export interface RequestUser { userId: UUID; nombre: string; rol: Role; sedeId: UUID | null; }
export interface LoginResponse { token: string; usuario: UserDTO; }
export interface ApiErrorBody { error: string; code?: string; }
export interface SedeDTO { id: UUID; nombre: string; direccion: string; telefono: string | null; activa: boolean; }
export interface CategoriaDTO { id: UUID; nombre: string; }
export interface ClienteDTO {
  id: UUID; nombre: string; documento: string | null; telefono: string | null;
  email: string | null; direccion: string | null; sedeId: UUID; createdAt: IsoDateTime;
}
export interface ProveedorDTO {
  id: UUID; nombre: string; nit: string; contacto: string | null; telefono: string | null;
  email: string | null; banco: string | null; cuentaBancaria: string | null; activo: boolean;
  /** Campo opcional de presentación; el modelo actual no lo persiste. */
  direccion?: string | null;
}
export interface ProductoDTO {
  id: UUID; nombre: string; codigoBarras: string; descripcion: string | null;
  precioVenta: DecimalText; precioCosto: DecimalText; categoriaId: UUID;
  tieneIVA: boolean; stockMinimo: number; tieneNumeroSerie: boolean; esServicio: boolean;
  esCombo: boolean; unidadMedida: 'und' | 'm'; esReacondicionado: boolean; imagenUrl: string | null;
  activo?: boolean; categoriaNombre?: string; categoria?: Pick<CategoriaDTO, 'nombre'> & Partial<Pick<CategoriaDTO, 'id'>>; disponibilidadCombo?: number;
}
export interface StockDTO { id: UUID; productoId: UUID; sedeId: UUID; cantidad: number; producto?: ProductoDTO; }
export interface MovimientoDTO {
  id: UUID; fecha: IsoDateTime; tipo: 'entrada' | 'salida' | 'traslado_entrada' | 'traslado_salida' | 'ajuste';
  direccion: 'entrada' | 'salida'; producto: string; codigo: string; sede: string;
  cantidad: number; responsable: string; referencia: string; detalle: string;
}
export interface Paginated<T> { items: T[]; pagination: { page: number; limit: number; total: number; totalPages: number }; }
export interface InversionInventarioItem {
  id: UUID; productoId: UUID; nombre: string; codigoBarras: string;
  sedeId: UUID; sedeNombre: string; cantidad: number; unidadMedida: string;
  costoUnitario: DecimalText; inversionTotal: DecimalText; activo: boolean; sinCosto: boolean;
}
export interface InversionInventarioDTO extends Paginated<InversionInventarioItem> {
  consultadoEn: IsoDateTime;
  alcance: { sedeId: UUID | null; nombre: string };
  resumen: { inversionTotal: DecimalText; productosConExistencias: number; productosSinCosto: number };
  sedes: { sedeId: UUID; nombre: string; inversionTotal: DecimalText; productosConExistencias: number }[];
}
/** Los métodos de pago pueden ser personalizados en configuración. */
export interface PagoInput { metodo: string; monto: number; }
export interface PagoDTO { id: UUID; ventaId: UUID; metodo: string; monto: DecimalText; }
export interface CajaDTO {
  id: UUID; sedeId: UUID; usuarioAperturaId: UUID; estado: 'abierta' | 'cerrada'; fecha: DateOnly;
  montoApertura: DecimalText; totalVentasEfectivo: DecimalText; totalVentasNequi: DecimalText;
  totalVentasDaviplata: DecimalText; totalVentasTarjeta: DecimalText; totalVentasTransferencia: DecimalText;
  totalEgresos: DecimalText; cierrePendiente?: boolean; fechaOperativa?: DateOnly;
  totalesPorMetodo?: Record<string, number> | null;
}
export type CajaReporte = CajaDTO | { estado: 'sin_registro'; sedeId: UUID; fecha: DateOnly };
export interface VentaDTO {
  id: UUID; numeroVenta: string; clienteId: UUID | null; usuarioId: UUID; sedeId: UUID;
  subtotal: DecimalText; descuentoTotal: DecimalText; iva: DecimalText; total: DecimalText;
  esCredito: boolean; saldoPendiente: DecimalText; estado: 'completada' | 'credito' | 'anulada';
  devolucionEstado: 'ninguna' | 'parcial' | 'total'; observaciones: string | null; idempotencyKey: string | null;
}
/** Resultado calculado de POST /ventas: importes numéricos, distinto de VentaDTO. */
export interface VentaCreada {
  message: string; ventaId: UUID; numeroVenta: string; facturaId: UUID; numeroFactura: string;
  subtotal: number; descuentoTotal: number; iva: number; total: number; pagos: PagoInput[]; cambio: number;
  esCredito: boolean; items: VentaItemCalculado[];
}
export interface VentaItemCalculado { productoId: UUID | null; cantidad: number; precioBase: number; precioModificado: number; descuentoPct: number; subtotal: number; imei?: string | null; }
export interface DataChangeDetail { scope: string; sourceRoute: string; remote: boolean; }
export type QuickActionId = 'venta' | 'egreso' | 'abono';
export interface QuickActionDetail { action: QuickActionId; }
export interface QuickAction { id: QuickActionId; route: string; label: string; description: string; icon: string; }
export interface ApiResponses {
  '/auth/me': { usuario: UserDTO };
  '/config/sedes': SedeDTO[];
  '/productos': ProductoDTO[];
  '/inventario/stock': StockDTO[];
  '/inventario/movimientos': Paginated<MovimientoDTO>;
  '/inventario/inversion': InversionInventarioDTO;
  '/caja/reporte': CajaReporte;
}
