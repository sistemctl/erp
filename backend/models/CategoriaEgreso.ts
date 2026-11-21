import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type EgresoCaja = require('./EgresoCaja');

interface CategoriaEgresoAttributes {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
type CategoriaEgresoCreation = Optional<CategoriaEgresoAttributes, 'id' | 'descripcion' | 'activa' | 'createdAt' | 'updatedAt'>;
interface CategoriaEgreso extends Model<CategoriaEgresoAttributes, CategoriaEgresoCreation>, CategoriaEgresoAttributes {
  egresos?: EgresoCaja[];
}


const CategoriaEgreso = sequelize.define<CategoriaEgreso, Omit<CategoriaEgresoAttributes, 'createdAt' | 'updatedAt'>>('CategoriaEgreso', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  descripcion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  activa: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'CategoriasEgreso'
});

export = CategoriaEgreso;
