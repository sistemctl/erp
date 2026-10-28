import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Venta = require('./Venta');

interface PagoVentaAttributes {
  id: string;
  ventaId: string;
  metodo: string;
  monto: string | number;
  createdAt: Date;
  updatedAt: Date;
}
type PagoVentaCreation = Optional<PagoVentaAttributes, 'id' | 'monto' | 'createdAt' | 'updatedAt'>;
interface PagoVenta extends Model<PagoVentaAttributes, PagoVentaCreation>, PagoVentaAttributes {
  venta?: Venta | null;
}


const PagoVenta = sequelize.define<PagoVenta, Omit<PagoVentaAttributes, 'createdAt' | 'updatedAt'>>('PagoVenta', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  metodo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'PagosVenta'
});

export = PagoVenta;
