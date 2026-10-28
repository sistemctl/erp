import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Producto = require('./Producto');
import type Sede = require('./Sede');
import type Cliente = require('./Cliente');

interface NumeroSerieAttributes {
  id: string;
  serie: string;
  productoId: string;
  sedeId: string;
  estado: 'en_stock' | 'vendido' | 'en_reparacion' | 'reacondicionado' | 'instalado';
  clienteId: string | null;
  fechaVenta: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
type NumeroSerieCreation = Optional<NumeroSerieAttributes, 'id' | 'estado' | 'clienteId' | 'fechaVenta' | 'createdAt' | 'updatedAt'>;
interface NumeroSerie extends Model<NumeroSerieAttributes, NumeroSerieCreation>, NumeroSerieAttributes {
  producto?: Producto | null;
  sede?: Sede | null;
  cliente?: Cliente | null;
}


const NumeroSerie = sequelize.define<NumeroSerie, Omit<NumeroSerieAttributes, 'createdAt' | 'updatedAt'>>('NumeroSerie', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  serie: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('en_stock', 'vendido', 'en_reparacion', 'reacondicionado', 'instalado'),
    defaultValue: 'en_stock',
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  fechaVenta: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'NumerosSerie'
});

export = NumeroSerie;
