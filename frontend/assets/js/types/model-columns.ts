/** Database transport columns: DECIMAL and dates remain strings. JSON shapes are narrowed per endpoint. */
export interface AbonoColumns {
  cajaId: string | null;
  anuladoAt: string | null;
  id: string;
  cuentaPorCobrarId: string;
  usuarioId: string;
  monto: string;
  metodo: string;
  observaciones: string | null;
  createdAt: string; updatedAt: string;
}

export interface AuditLogColumns {
  id: string;
  usuarioId: string | null;
  accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'PRICE_OVERRIDE' | 'EGRESO_CAJA';
  modulo: string;
  registroId: string | null;
  valorAnterior: unknown | null;
  valorNuevo: unknown | null;
  sedeId: string | null;
  ip: string | null;
  createdAt: string; updatedAt: string;
}

export interface CajaColumns {
  arqueoDeclarado: unknown | null;
  ingresosAlCierre: unknown | null;
  id: string;
  sedeId: string;
  usuarioAperturaId: string;
  montoApertura: string;
  fecha: string;
  estado: 'abierta' | 'cerrada';
  usuarioCierreId: string | null;
  horaCierre: string | null;
  totalVentasEfectivo: string | null;
  totalVentasNequi: string | null;
  totalVentasDaviplata: string | null;
  totalVentasTarjeta: string | null;
  totalVentasTransferencia: string | null;
  totalesPorMetodo: unknown;
  totalEgresos: string | null;
  diferencia: string | null;
  observaciones: string | null;
  createdAt: string; updatedAt: string;
}

export interface CategoriaColumns {
  id: string;
  nombre: string;
  descripcion: string | null;
  createdAt: string; updatedAt: string;
}

export interface CategoriaEgresoColumns {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean | null;
  createdAt: string; updatedAt: string;
}

export interface ClienteColumns {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  documento: string | null;
  direccion: string | null;
  sedeId: string;
  createdAt: string; updatedAt: string;
}

export interface ComboComponenteColumns {
  id: string;
  comboId: string;
  productoId: string;
  cantidad: number;
  createdAt: string; updatedAt: string;
}

export interface ConfiguracionSistemaColumns {
  id: string;
  empresa: string;
  logoUrl: string | null;
  nit: string | null;
  direccion: string | null;
  telefono: string | null;
  descuentoMaximoPct: string | null;
  egresoMaximoSinPin: string | null;
  notificacionesActivas: boolean | null;
  smsActivo: boolean | null;
  whatsappActivo: boolean | null;
  emailActivo: boolean | null;
  emailFacturaAuto: boolean | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  smtpIgnoreTlsErrors: boolean | null;
  templateEmailFacturaAsunto: string | null;
  templateEmailFacturaCuerpo: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioFromNumber: string | null;
  ivaDefecto: string | null;
  cobrarIvaPos: boolean | null;
  cobrarIvaTaller: boolean | null;
  mediosPago: unknown;
  cajaCompartidaSede: boolean | null;
  templateRecibido: string | null;
  templateListo: string | null;
  templateEntregado: string | null;
  temaInterfaz: unknown | null;
  nominaFrecuenciaDefault: 'quincenal' | 'mensual' | null;
  nominaDiaCorteQuincena: number | null;
  nominaDiaPago1: number | null;
  nominaDiaPago2: number | null;
  puertoServidor: number;
  diasPlazoCredito: number | null;
  emailCarteraRecordatorio: boolean | null;
  diasMoraRecordatorioCartera: number | null;
  templateEmailCarteraAsunto: string | null;
  templateEmailCarteraCuerpo: string | null;
  createdAt: string; updatedAt: string;
}

export interface CotizacionColumns {
  id: string;
  numeroCotizacion: string;
  clienteId: string;
  usuarioId: string;
  sedeId: string;
  total: string;
  estado: 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'expirada';
  fechaVencimiento: string;
  notas: string | null;
  ventaId: string | null;
  ordenReparacionId: string | null;
  createdAt: string; updatedAt: string;
}

export interface CuentaPorCobrarColumns {
  anuladaAt: string | null;
  id: string;
  facturaId: string;
  clienteId: string;
  pagadorExterno: string | null;
  esRecaudoExterno: boolean;
  totalOriginal: string;
  totalAbonado: string | null;
  saldoPendiente: string;
  fechaVencimiento: string;
  estado: 'al_dia' | 'vencida' | 'pagada';
  createdAt: string; updatedAt: string;
}

export interface DevolucionVentaColumns {
  id: string;
  numero: string;
  ventaId: string;
  sedeId: string;
  usuarioId: string;
  cajaId: string | null;
  motivo: string;
  total: string;
  metodoReembolso: string;
  createdAt: string; updatedAt: string;
}

export interface EgresoCajaColumns {
  id: string;
  cajaId: string;
  usuarioId: string;
  categoriaId: string;
  monto: string;
  motivo: string;
  requirioPin: boolean | null;
  autorizadoPor: string | null;
  pagoCompraId: string | null;
  createdAt: string; updatedAt: string;
}

export interface EmpleadoColumns {
  id: string;
  usuarioId: string | null;
  nombre: string;
  documento: string;
  telefono: string | null;
  email: string | null;
  cargo: string | null;
  sedeId: string;
  tipoContrato: 'indefinido' | 'fijo' | 'prestacion_servicios';
  salarioBase: string;
  auxilioTransporte: boolean | null;
  fechaIngreso: string;
  activo: boolean | null;
  cuentaBancaria: string | null;
  banco: string | null;
  createdAt: string; updatedAt: string;
}

export interface FacturaColumns {
  cajaId: string | null;
  pagosCaja: unknown | null;
  cajaRevertidaAt: string | null;
  id: string;
  numeroFactura: string;
  ventaId: string | null;
  ordenReparacionId: string | null;
  ordenInstalacionId: string | null;
  clienteId: string;
  sedeId: string;
  subtotal: string;
  iva: string;
  total: string;
  estado: 'pagada' | 'pendiente' | 'vencida' | 'abono_parcial' | 'anulada';
  fechaVencimiento: string;
  createdAt: string; updatedAt: string;
}

export interface FotoReparacionColumns {
  id: string;
  ordenId: string;
  url: string;
  momento: 'recepcion' | 'entrega';
  createdAt: string; updatedAt: string;
}

export interface ItemCotizacionColumns {
  id: string;
  cotizacionId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  productoId: string | null;
  createdAt: string; updatedAt: string;
}

export interface ItemDevolucionColumns {
  id: string;
  devolucionId: string;
  itemVentaId: string;
  productoId: string;
  cantidad: number;
  montoLinea: string;
  createdAt: string; updatedAt: string;
}

export interface ItemOrdenCompraColumns {
  id: string;
  ordenCompraId: string;
  productoId: string;
  cantidadPedida: number;
  cantidadRecibida: number | null;
  precioUnitario: string;
  createdAt: string; updatedAt: string;
}

export interface ItemVentaColumns {
  id: string;
  ventaId: string;
  productoId: string;
  numeroSerieId: string | null;
  cantidad: number;
  precioBase: string;
  precioModificado: string;
  descuentoPct: string;
  iva: string;
  ivaTotal: string | null;
  subtotal: string;
  autorizadoPorAdmin: boolean | null;
  cantidadDevuelta: number;
  createdAt: string; updatedAt: string;
}

export interface ItemVentaComponenteColumns {
  id: string;
  itemVentaId: string;
  productoId: string;
  cantidad: number;
  unidadCombo: number;
  numeroSerieId: string | null;
  devuelto: boolean;
  createdAt: string; updatedAt: string;
}

export interface MaterialInstalacionColumns {
  id: string;
  ordenId: string;
  productoId: string;
  cantidad: number;
  costoUnitario: string;
  precioUnitario: string;
  series: unknown | null;
  createdAt: string; updatedAt: string;
}

export interface MovimientoInventarioColumns {
  id: string;
  productoId: string;
  sedeId: string;
  tipo: 'entrada' | 'salida' | 'traslado_entrada' | 'traslado_salida' | 'ajuste';
  cantidad: number;
  motivo: string | null;
  referenciaId: string | null;
  usuarioId: string;
  createdAt: string; updatedAt: string;
}

export interface NominaColumns {
  id: string;
  empleadoId: string;
  periodo: string;
  tipoPeriodo: 'quincenal' | 'mensual';
  salarioBase: string;
  auxilioTransporte: string | null;
  horasExtra: string | null;
  recargosNocturnos: string | null;
  dominicales: string | null;
  bonos: string | null;
  deduccionEPS: string | null;
  deduccionPension: string | null;
  deduccionPrestamos: string | null;
  totalDevengado: string | null;
  totalDeducciones: string | null;
  neto: string | null;
  estado: 'borrador' | 'aprobada' | 'pagada';
  createdAt: string; updatedAt: string;
}

export interface NotificacionColumns {
  id: string;
  ordenReparacionId: string | null;
  facturaId: string | null;
  clienteId: string;
  canal: 'sms' | 'whatsapp' | 'email';
  mensaje: string;
  estado: 'enviado' | 'fallido' | 'pendiente';
  errorDetalle: string | null;
  createdAt: string; updatedAt: string;
}

export interface NumeroSerieColumns {
  id: string;
  serie: string;
  productoId: string;
  sedeId: string;
  estado: 'en_stock' | 'vendido' | 'en_reparacion' | 'reacondicionado' | 'instalado';
  clienteId: string | null;
  fechaVenta: string | null;
  createdAt: string; updatedAt: string;
}

export interface OrdenCompraColumns {
  id: string;
  proveedorId: string;
  usuarioId: string;
  sedeId: string;
  total: string;
  estado: 'pendiente' | 'recibida' | 'parcial' | 'cancelada';
  estadoPago: 'pendiente' | 'abono_parcial' | 'pagado';
  fechaVencimientoPago: string | null;
  saldoPendiente: string;
  fechaEsperada: string | null;
  observaciones: string | null;
  createdAt: string; updatedAt: string;
}

export interface OrdenInstalacionColumns {
  id: string;
  numeroOrden: string;
  clienteId: string;
  sedeId: string;
  tecnicoId: string | null;
  sitio: string | null;
  direccion: string | null;
  descripcion: string | null;
  valorServicio: string | null;
  precioCerrado: boolean;
  costoMateriales: string | null;
  totalCobrado: string | null;
  estado: 'borrador' | 'en_proceso' | 'entregada' | 'cancelada';
  fechaProgramada: string | null;
  observaciones: string | null;
  createdAt: string; updatedAt: string;
}

export interface OrdenReparacionColumns {
  id: string;
  numeroOrden: string;
  tokenPublico: string;
  clienteId: string;
  tecnicoId: string | null;
  sedeId: string;
  modalidad: 'taller' | 'domicilio';
  direccionServicio: string | null;
  tipoEquipo: string;
  marca: string;
  modelo: string;
  imei: string | null;
  problemaReportado: string;
  diagnostico: string | null;
  costoManoObra: string | null;
  costoRepuestos: string | null;
  totalCobrado: string | null;
  estado: 'recibido' | 'diagnostico' | 'en_reparacion' | 'listo' | 'entregado' | 'cancelado';
  diasGarantia: number | null;
  fechaEstimadaEntrega: string | null;
  observaciones: string | null;
  notificacionEnviada: boolean | null;
  createdAt: string; updatedAt: string;
}

export interface PagoCompraColumns {
  id: string;
  ordenCompraId: string;
  usuarioId: string;
  monto: string;
  fuenteFondos: 'caja_efectivo' | 'efectivo_externo' | 'transferencia_empresa' | 'otro';
  pagadoPor: string | null;
  referencia: string | null;
  createdAt: string; updatedAt: string;
}

export interface PagoVentaColumns {
  id: string;
  ventaId: string;
  metodo: string;
  monto: string;
  createdAt: string; updatedAt: string;
}

export interface ProductoColumns {
  id: string;
  nombre: string;
  codigoBarras: string;
  descripcion: string | null;
  precioVenta: string;
  precioCosto: string;
  tieneIVA: boolean | null;
  stockMinimo: number | null;
  tieneNumeroSerie: boolean | null;
  esServicio: boolean | null;
  esCombo: boolean | null;
  unidadMedida: string;
  esReacondicionado: boolean | null;
  categoriaId: string;
  imagenUrl: string | null;
  activo: boolean | null;
  createdAt: string; updatedAt: string;
}

export interface ProveedorColumns {
  id: string;
  nombre: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  banco: string | null;
  cuentaBancaria: string | null;
  activo: boolean | null;
  createdAt: string; updatedAt: string;
}

export interface ReclamoGarantiaColumns {
  id: string;
  numero: string;
  serie: string;
  numeroSerieId: string | null;
  productoId: string | null;
  clienteId: string | null;
  sedeId: string;
  ventaId: string | null;
  usuarioId: string;
  motivo: string;
  estado: 'abierto' | 'en_revision' | 'aprobado' | 'rechazado' | 'cerrado';
  diasGarantia: number | null;
  fechaVenta: string | null;
  fechaVenceGarantia: string | null;
  dentroDeGarantia: boolean | null;
  observaciones: string | null;
  ordenReparacionId: string | null;
  createdAt: string; updatedAt: string;
}

export interface RentabilidadReparacionColumns {
  id: string;
  ordenId: string;
  costoReal: string;
  totalCobrado: string;
  margen: string;
  createdAt: string; updatedAt: string;
}

export interface RepuestoOrdenColumns {
  id: string;
  ordenId: string;
  productoId: string;
  cantidad: number;
  costoUnitario: string;
  createdAt: string; updatedAt: string;
}

export interface SedeColumns {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string | null;
  activa: boolean | null;
  createdAt: string; updatedAt: string;
}

export interface StockSedeColumns {
  id: string;
  productoId: string;
  sedeId: string;
  cantidad: number;
  createdAt: string; updatedAt: string;
}

export interface TradeInColumns {
  id: string;
  clienteId: string;
  sedeId: string;
  usuarioId: string;
  tipoEquipo: string;
  marca: string;
  modelo: string;
  imei: string | null;
  estadoFisico: 'excelente' | 'bueno' | 'regular' | 'malo';
  valoracion: string;
  ventaId: string | null;
  productoInventarioId: string | null;
  createdAt: string; updatedAt: string;
}

export interface UsuarioColumns {
  id: string;
  nombre: string;
  email: string;
  password: string;
  rol: 'superadmin' | 'admin' | 'gerente_sede' | 'cajero' | 'tecnico' | 'contador';
  sedeId: string | null;
  sessionVersion: number;
  activo: boolean | null;
  createdAt: string; updatedAt: string;
}

export interface VentaColumns {
  id: string;
  numeroVenta: string;
  clienteId: string | null;
  usuarioId: string;
  sedeId: string;
  subtotal: string;
  descuentoTotal: string;
  iva: string;
  total: string;
  esCredito: boolean | null;
  saldoPendiente: string | null;
  estado: 'completada' | 'credito' | 'anulada';
  devolucionEstado: string;
  observaciones: string | null;
  idempotencyKey: string | null;
  createdAt: string; updatedAt: string;
}
