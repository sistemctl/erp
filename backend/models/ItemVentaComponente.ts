import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type ItemVenta = require('./ItemVenta');
import type Producto = require('./Producto');
import type NumeroSerie = require('./NumeroSerie');

interface ItemVentaComponenteAttributes {
  id: string;
  itemVentaId: string;
  productoId: string;
  cantidad: number;
  unidadCombo: number;
  numeroSerieId: string | null;
  devuelto: boolean;
  createdAt: Date;
  updatedAt: Date;
}
type ItemVentaComponenteCreation = Optional<ItemVentaComponenteAttributes, 'id' | 'cantidad' | 'numeroSerieId' | 'devuelto' | 'createdAt' | 'updatedAt'>;
interface ItemVentaComponente extends Model<ItemVentaComponenteAttributes, ItemVentaComponenteCreation>, ItemVentaComponenteAttributes {
  itemVenta?: ItemVenta | null;
  producto?: Producto | null;
  numeroSerie?: NumeroSerie | null;
}


const ItemVentaComponente = sequelize.define<ItemVentaComponente, Omit<ItemVentaComponenteAttributes, 'createdAt' | 'updatedAt'>>('ItemVentaComponente', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
    defaultValue: 1,
    validate: { min: 1 }
  },
  /** Identifica a cuál unidad del combo pertenece el componente. */
  unidadCombo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1 }
  },
  numeroSerieId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  devuelto: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'ItemsVentaComponentes'
});

export = ItemVentaComponente;
