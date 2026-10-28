import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type OrdenCompra = require('./OrdenCompra');
import type Producto = require('./Producto');

interface ItemOrdenCompraAttributes {
  id: string;
  ordenCompraId: string;
  productoId: string;
  cantidadPedida: number;
  cantidadRecibida: number | null;
  precioUnitario: string | number;
  createdAt: Date;
  updatedAt: Date;
}
type ItemOrdenCompraCreation = Optional<ItemOrdenCompraAttributes, 'id' | 'cantidadRecibida' | 'precioUnitario' | 'createdAt' | 'updatedAt'>;
interface ItemOrdenCompra extends Model<ItemOrdenCompraAttributes, ItemOrdenCompraCreation>, ItemOrdenCompraAttributes {
  ordenCompra?: OrdenCompra | null;
  producto?: Producto | null;
}


const ItemOrdenCompra = sequelize.define<ItemOrdenCompra, Omit<ItemOrdenCompraAttributes, 'createdAt' | 'updatedAt'>>('ItemOrdenCompra', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenCompraId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cantidadPedida: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  cantidadRecibida: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  precioUnitario: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'ItemsOrdenCompra'
});

export = ItemOrdenCompra;
