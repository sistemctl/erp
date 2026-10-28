import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Venta = require('./Venta');
import type Sede = require('./Sede');
import type Usuario = require('./Usuario');
import type Caja = require('./Caja');
import type ItemDevolucion = require('./ItemDevolucion');

interface DevolucionVentaAttributes {
  id: string;
  numero: string;
  ventaId: string;
  sedeId: string;
  usuarioId: string;
  cajaId: string | null;
  motivo: string;
  total: string | number;
  metodoReembolso: string;
  createdAt: Date;
  updatedAt: Date;
}
type DevolucionVentaCreation = Optional<DevolucionVentaAttributes, 'id' | 'cajaId' | 'total' | 'metodoReembolso' | 'createdAt' | 'updatedAt'>;
interface DevolucionVenta extends Model<DevolucionVentaAttributes, DevolucionVentaCreation>, DevolucionVentaAttributes {
  venta?: Venta | null;
  sede?: Sede | null;
  usuario?: Usuario | null;
  caja?: Caja | null;
  items?: ItemDevolucion[];
}


const DevolucionVenta = sequelize.define<DevolucionVenta, Omit<DevolucionVentaAttributes, 'createdAt' | 'updatedAt'>>('DevolucionVenta', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numero: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cajaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  metodoReembolso: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'efectivo'
  }
}, {
  tableName: 'DevolucionesVenta'
});

export = DevolucionVenta;
