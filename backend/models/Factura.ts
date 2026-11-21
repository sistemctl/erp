import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Venta = require('./Venta');
import type OrdenReparacion = require('./OrdenReparacion');
import type OrdenInstalacion = require('./OrdenInstalacion');
import type Cliente = require('./Cliente');
import type Sede = require('./Sede');
import type CuentaPorCobrar = require('./CuentaPorCobrar');
import type Notificacion = require('./Notificacion');
import type { PagoCaja } from '../types/model-json';

interface FacturaAttributes {
  cajaId: string | null;
  pagosCaja: PagoCaja[] | null;
  cajaRevertidaAt: Date | null;
  id: string;
  numeroFactura: string;
  ventaId: string | null;
  ordenReparacionId: string | null;
  ordenInstalacionId: string | null;
  clienteId: string;
  sedeId: string;
  subtotal: string | number;
  iva: string | number;
  total: string | number;
  estado: 'pagada' | 'pendiente' | 'vencida' | 'abono_parcial' | 'anulada';
  fechaVencimiento: Date;
  createdAt: Date;
  updatedAt: Date;
}
type FacturaCreation = Optional<FacturaAttributes, 'cajaId' | 'pagosCaja' | 'cajaRevertidaAt' | 'id' | 'ventaId' | 'ordenReparacionId' | 'ordenInstalacionId' | 'subtotal' | 'iva' | 'total' | 'estado' | 'createdAt' | 'updatedAt'>;
interface Factura extends Model<FacturaAttributes, FacturaCreation>, FacturaAttributes {
  venta?: Venta | null;
  ordenReparacion?: OrdenReparacion | null;
  ordenInstalacion?: OrdenInstalacion | null;
  cliente?: Cliente | null;
  sede?: Sede | null;
  cuentaPorCobrar?: CuentaPorCobrar | null;
  notificaciones?: Notificacion[];
}


const Factura = sequelize.define<Factura, Omit<FacturaAttributes, 'createdAt' | 'updatedAt'>>('Factura', {
  cajaId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'Cajas', key: 'id' }
  },
  // Desglose neto recibido al emitirla; null identifica facturas históricas.
  pagosCaja: { type: DataTypes.JSONB, allowNull: true },
  cajaRevertidaAt: { type: DataTypes.DATE, allowNull: true },
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numeroFactura: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  ordenReparacionId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  ordenInstalacionId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  clienteId: {
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
  estado: {
    type: DataTypes.ENUM('pagada', 'pendiente', 'vencida', 'abono_parcial', 'anulada'),
    defaultValue: 'pendiente',
    allowNull: false
  },
  fechaVencimiento: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'Facturas'
});

export = Factura;
