import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Producto = require('./Producto');

interface ComboComponenteAttributes {
  id: string;
  comboId: string;
  productoId: string;
  cantidad: number;
  createdAt: Date;
  updatedAt: Date;
}
type ComboComponenteCreation = Optional<ComboComponenteAttributes, 'id' | 'createdAt' | 'updatedAt'>;
interface ComboComponente extends Model<ComboComponenteAttributes, ComboComponenteCreation>, ComboComponenteAttributes {
  combo?: Producto | null;
  producto?: Producto | null;
}


const ComboComponente = sequelize.define<ComboComponente, Omit<ComboComponenteAttributes, 'createdAt' | 'updatedAt'>>('ComboComponente', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  comboId: {
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
    validate: { min: 1 }
  }
}, {
  tableName: 'ComboComponentes',
  indexes: [{ unique: true, fields: ['comboId', 'productoId'] }]
});

export = ComboComponente;
