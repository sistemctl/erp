import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Producto = require('./Producto');

interface CategoriaAttributes {
  id: string;
  nombre: string;
  descripcion: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type CategoriaCreation = Optional<CategoriaAttributes, 'id' | 'descripcion' | 'createdAt' | 'updatedAt'>;
interface Categoria extends Model<CategoriaAttributes, CategoriaCreation>, CategoriaAttributes {
  productos?: Producto[];
}


const Categoria = sequelize.define<Categoria, Omit<CategoriaAttributes, 'createdAt' | 'updatedAt'>>('Categoria', {
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
  }
}, {
  tableName: 'Categorias'
});

export = Categoria;
