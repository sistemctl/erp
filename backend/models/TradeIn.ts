import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Cliente = require('./Cliente');
import type Sede = require('./Sede');
import type Usuario = require('./Usuario');
import type Venta = require('./Venta');
import type Producto = require('./Producto');

interface TradeInAttributes {
  id: string;
  clienteId: string;
  sedeId: string;
  usuarioId: string;
  tipoEquipo: string;
  marca: string;
  modelo: string;
  imei: string | null;
  estadoFisico: 'excelente' | 'bueno' | 'regular' | 'malo';
  valoracion: string | number;
  ventaId: string | null;
  productoInventarioId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type TradeInCreation = Optional<TradeInAttributes, 'id' | 'imei' | 'valoracion' | 'ventaId' | 'productoInventarioId' | 'createdAt' | 'updatedAt'>;
interface TradeIn extends Model<TradeInAttributes, TradeInCreation>, TradeInAttributes {
  cliente?: Cliente | null;
  sede?: Sede | null;
  usuario?: Usuario | null;
  venta?: Venta | null;
  productoInventario?: Producto | null;
}


const TradeIn = sequelize.define<TradeIn, Omit<TradeInAttributes, 'createdAt' | 'updatedAt'>>('TradeIn', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tipoEquipo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  marca: {
    type: DataTypes.STRING,
    allowNull: false
  },
  modelo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  imei: {
    type: DataTypes.STRING,
    allowNull: true
  },
  estadoFisico: {
    type: DataTypes.ENUM('excelente', 'bueno', 'regular', 'malo'),
    allowNull: false
  },
  valoracion: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  productoInventarioId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'TradeIns'
});

export = TradeIn;
