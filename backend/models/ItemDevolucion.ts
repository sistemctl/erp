import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type DevolucionVenta = require('./DevolucionVenta');
import type ItemVenta = require('./ItemVenta');
import type Producto = require('./Producto');

interface ItemDevolucionAttributes {
  id: string;
  devolucionId: string;
  itemVentaId: string;
  productoId: string;
  cantidad: number;
  montoLinea: string | number;
  createdAt: Date;
  updatedAt: Date;
}
type ItemDevolucionCreation = Optional<ItemDevolucionAttributes, 'id' | 'cantidad' | 'montoLinea' | 'createdAt' | 'updatedAt'>;
interface ItemDevolucion extends Model<ItemDevolucionAttributes, ItemDevolucionCreation>, ItemDevolucionAttributes {
  devolucion?: DevolucionVenta | null;
  itemVenta?: ItemVenta | null;
  producto?: Producto | null;
}


const ItemDevolucion = sequelize.define<ItemDevolucion, Omit<ItemDevolucionAttributes, 'createdAt' | 'updatedAt'>>('ItemDevolucion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  devolucionId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  itemVentaId: {
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
  montoLinea: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'ItemsDevolucion'
});

export = ItemDevolucion;
