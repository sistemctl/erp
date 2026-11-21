import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Producto = require('./Producto');
import type Sede = require('./Sede');

interface StockSedeAttributes {
  id: string;
  productoId: string;
  sedeId: string;
  cantidad: number;
  createdAt: Date;
  updatedAt: Date;
}
type StockSedeCreation = Optional<StockSedeAttributes, 'id' | 'cantidad' | 'createdAt' | 'updatedAt'>;
interface StockSede extends Model<StockSedeAttributes, StockSedeCreation>, StockSedeAttributes {
  producto?: Producto | null;
  sede?: Sede | null;
}


const StockSede = sequelize.define<StockSede, Omit<StockSedeAttributes, 'createdAt' | 'updatedAt'>>('StockSede', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  }
}, {
  tableName: 'StockSedes'
});

export = StockSede;
