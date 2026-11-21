import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Cliente = require('./Cliente');
import type Usuario = require('./Usuario');
import type Sede = require('./Sede');
import type ItemVenta = require('./ItemVenta');
import type PagoVenta = require('./PagoVenta');
import type DevolucionVenta = require('./DevolucionVenta');
import type Cotizacion = require('./Cotizacion');
import type TradeIn = require('./TradeIn');
import type Factura = require('./Factura');

interface VentaAttributes {
  id: string;
  numeroVenta: string;
  clienteId: string | null;
  usuarioId: string;
  sedeId: string;
  subtotal: string | number;
  descuentoTotal: string | number;
  iva: string | number;
  total: string | number;
  esCredito: boolean | null;
  saldoPendiente: string | number | null;
  estado: 'completada' | 'credito' | 'anulada';
  devolucionEstado: string;
  observaciones: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type VentaCreation = Optional<VentaAttributes, 'id' | 'clienteId' | 'subtotal' | 'descuentoTotal' | 'iva' | 'total' | 'esCredito' | 'saldoPendiente' | 'estado' | 'devolucionEstado' | 'observaciones' | 'idempotencyKey' | 'createdAt' | 'updatedAt'>;
interface Venta extends Model<VentaAttributes, VentaCreation>, VentaAttributes {
  cliente?: Cliente | null;
  usuario?: Usuario | null;
  sede?: Sede | null;
  items?: ItemVenta[];
  pagos?: PagoVenta[];
  devoluciones?: DevolucionVenta[];
  cotizacion?: Cotizacion | null;
  tradeIns?: TradeIn[];
  factura?: Factura | null;
}


const Venta = sequelize.define<Venta, Omit<VentaAttributes, 'createdAt' | 'updatedAt'>>('Venta', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numeroVenta: {
    type: DataTypes.STRING,
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  subtotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  descuentoTotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  iva: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  esCredito: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  saldoPendiente: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('completada', 'credito', 'anulada'),
    defaultValue: 'completada',
    allowNull: false
  },
  /** ninguna | parcial | total — no pisa anulada */
  devolucionEstado: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ninguna'
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  /** Clave de idempotencia del cliente (evita doble venta en reintentos de red) */
  idempotencyKey: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true
  }
}, {
  tableName: 'Ventas'
});

export = Venta;
