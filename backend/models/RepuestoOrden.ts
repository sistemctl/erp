import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type OrdenReparacion = require('./OrdenReparacion');
import type Producto = require('./Producto');

interface RepuestoOrdenAttributes {
  id: string;
  ordenId: string;
  productoId: string;
  cantidad: number;
  costoUnitario: string | number;
  createdAt: Date;
  updatedAt: Date;
}
type RepuestoOrdenCreation = Optional<RepuestoOrdenAttributes, 'id' | 'cantidad' | 'costoUnitario' | 'createdAt' | 'updatedAt'>;
interface RepuestoOrden extends Model<RepuestoOrdenAttributes, RepuestoOrdenCreation>, RepuestoOrdenAttributes {
  orden?: OrdenReparacion | null;
  producto?: Producto | null;
}


const RepuestoOrden = sequelize.define<RepuestoOrden, Omit<RepuestoOrdenAttributes, 'createdAt' | 'updatedAt'>>('RepuestoOrden', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  costoUnitario: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'RepuestosOrden'
});

export = RepuestoOrden;
