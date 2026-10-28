import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Cotizacion = require('./Cotizacion');
import type Producto = require('./Producto');

interface ItemCotizacionAttributes {
  id: string;
  cotizacionId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: string | number;
  subtotal: string | number;
  productoId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type ItemCotizacionCreation = Optional<ItemCotizacionAttributes, 'id' | 'cantidad' | 'precioUnitario' | 'subtotal' | 'productoId' | 'createdAt' | 'updatedAt'>;
interface ItemCotizacion extends Model<ItemCotizacionAttributes, ItemCotizacionCreation>, ItemCotizacionAttributes {
  cotizacion?: Cotizacion | null;
  producto?: Producto | null;
}


const ItemCotizacion = sequelize.define<ItemCotizacion, Omit<ItemCotizacionAttributes, 'createdAt' | 'updatedAt'>>('ItemCotizacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cotizacionId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  descripcion: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  precioUnitario: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  subtotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'ItemsCotizacion'
});

export = ItemCotizacion;
