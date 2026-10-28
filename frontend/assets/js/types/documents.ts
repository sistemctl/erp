export interface EmpresaDocumento {
  empresa?: string; nombreEmpresa?: string; nit?: string; direccion?: string; telefono?: string;
  email?: string; logoUrl?: string | null; ciudad?: string; ivaDefecto?: number | string;
}
export interface DocumentoSede { nombre: string; direccion?: string | null; telefono?: string | null; }
export interface DocumentoCliente { nombre: string; documento?: string | null; direccion?: string | null; telefono?: string | null; }
export interface DocumentoProducto { nombre: string; codigoBarras?: string; unidadMedida?: 'und' | 'm'; tieneIVA?: boolean; }
export interface CotizacionDocumento {
  numeroCotizacion: string; estado: string; sede?: DocumentoSede | null; cliente?: DocumentoCliente | null;
  usuario?: { nombre: string } | null; createdAt: string; fechaVencimiento?: string | null; notas?: string | null;
  items: { producto?: DocumentoProducto | null; descripcion: string; tieneIVA?: boolean; cantidad: number; precioUnitario: string | number; subtotal: string | number }[];
}
export interface FacturaDocumento {
  numeroFactura: string; estado: string; sede?: DocumentoSede | null; cliente?: DocumentoCliente | null;
  createdAt: string; fechaVencimiento?: string | null; iva: string; subtotal: string; total: string;
  venta?: {
    usuario?: { nombre: string } | null; pagos?: { metodo: string; monto: string }[];
    items?: { producto?: DocumentoProducto | null; cantidad: number; precioModificado: string; subtotal: string }[];
  } | null;
  ordenReparacion?: {
    tipoEquipo: string; marca: string; modelo: string; costoManoObra: string;
    repuestos?: { producto?: DocumentoProducto | null; cantidad: number; costoUnitario: string }[];
  } | null;
  ordenInstalacion?: {
    precioCerrado: boolean | 0 | 1; valorServicio: string; sitio: string | null; descripcion: string;
    numeroOrden: string; tecnico?: { nombre: string } | null;
    materiales?: { producto?: DocumentoProducto | null; cantidad: number; precioUnitario: string }[];
  } | null;
}
export interface ReceiptItem { cantidad: number; nombre: string; subtotal: number; imei?: string | null; }
export interface PosReceiptData {
  empresaConfig?: EmpresaDocumento; sedeNombre?: string; sedeDireccion?: string; cajeroNombre?: string;
  clienteNombre?: string; clienteDocumento?: string; clienteDireccion?: string; numeroFactura?: string;
  fecha?: Date | string; items?: readonly ReceiptItem[]; subtotal?: number; descuentoTotal?: number;
  iva?: number; total?: number; cobrarIva?: boolean; pagos?: readonly { metodo: string; monto: number | string }[];
  cambio?: number; esCredito?: boolean;
}
export interface DevolucionReceiptData {
  empresaConfig?: EmpresaDocumento; sedeNombre?: string; cajeroNombre?: string; clienteNombre?: string;
  numeroDevolucion?: string; numeroVenta?: string; fecha?: Date | string; total?: number;
  metodoReembolso?: string; motivo?: string; items?: readonly { cantidad: number; nombre?: string; montoLinea: number | string }[];
}
export interface CajaTicket {
  id?: string; sede?: { nombre: string }; usuarioApertura?: { nombre: string }; usuarioCierre?: { nombre: string };
  fecha?: string; createdAt?: string; updatedAt?: string; horaCierre?: string | null; observaciones?: string | null;
  montoApertura?: string | number; totalVentasEfectivo?: string | number; totalVentasNequi?: string | number;
  totalVentasDaviplata?: string | number; totalVentasTarjeta?: string | number;
  totalVentasTransferencia?: string | number; totalEgresos?: string | number; diferencia?: string | number;
}
export interface CierreTicketData {
  caja?: CajaTicket; config?: EmpresaDocumento;
  detalle?: {
    ventas?: readonly { id: string; numeroFactura?: string; medioPago?: string; total: string | number }[];
    egresos?: readonly { categoria?: string; motivo?: string; monto: string | number }[];
  };
}
