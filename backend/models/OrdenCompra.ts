import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Proveedor = require('./Proveedor');
import type Usuario = require('./Usuario');
import type Sede = require('./Sede');
import type ItemOrdenCompra = require('./ItemOrdenCompra');
import type PagoCompra = require('./PagoCompra');

interface OrdenCompraAttributes {
  id: string;
  proveedorId: string;
  usuarioId: string;
  sedeId: string;
  total: string | number;
  estado: 'pendiente' | 'recibida' | 'parcial' | 'cancelada';
  estadoPago: 'pendiente' | 'abono_parcial' | 'pagado';
  fechaVencimientoPago: Date | null;
  saldoPendiente: string | number;
  fechaEsperada: Date | null;
  observaciones: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type OrdenCompraCreation = Optional<OrdenCompraAttributes, 'id' | 'total' | 'estado' | 'estadoPago' | 'fechaVencimientoPago' | 'saldoPendiente' | 'fechaEsperada' | 'observaciones' | 'createdAt' | 'updatedAt'>;
interface OrdenCompra extends Model<OrdenCompraAttributes, OrdenCompraCreation>, OrdenCompraAttributes {
  proveedor?: Proveedor | null;
  usuario?: Usuario | null;
  sede?: Sede | null;
  items?: ItemOrdenCompra[];
  pagos?: PagoCompra[];
}


const OrdenCompra = sequelize.define<OrdenCompra, Omit<OrdenCompraAttributes, 'createdAt' | 'updatedAt'>>('OrdenCompra', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  proveedorId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('pendiente', 'recibida', 'parcial', 'cancelada'),
    defaultValue: 'pendiente',
    allowNull: false
  },
  estadoPago: {
    type: DataTypes.ENUM('pendiente', 'abono_parcial', 'pagado'),
    defaultValue: 'pendiente',
    allowNull: false
  },
  fechaVencimientoPago: {
    type: DataTypes.DATE,
    allowNull: true
  },
  saldoPendiente: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    allowNull: false
  },
  fechaEsperada: {
    type: DataTypes.DATE,
    allowNull: true
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'OrdenesCompra'
});

export = OrdenCompra;
