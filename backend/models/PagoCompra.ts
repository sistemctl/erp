import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type OrdenCompra = require('./OrdenCompra');
import type Usuario = require('./Usuario');
import type EgresoCaja = require('./EgresoCaja');

interface PagoCompraAttributes {
  id: string;
  ordenCompraId: string;
  usuarioId: string;
  monto: string | number;
  fuenteFondos: 'caja_efectivo' | 'efectivo_externo' | 'transferencia_empresa' | 'otro';
  pagadoPor: string | null;
  referencia: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type PagoCompraCreation = Optional<PagoCompraAttributes, 'id' | 'monto' | 'fuenteFondos' | 'pagadoPor' | 'referencia' | 'createdAt' | 'updatedAt'>;
interface PagoCompra extends Model<PagoCompraAttributes, PagoCompraCreation>, PagoCompraAttributes {
  ordenCompra?: OrdenCompra | null;
  usuario?: Usuario | null;
  egresoCaja?: EgresoCaja | null;
}


const PagoCompra = sequelize.define<PagoCompra, Omit<PagoCompraAttributes, 'createdAt' | 'updatedAt'>>('PagoCompra', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenCompraId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  fuenteFondos: {
    type: DataTypes.ENUM('caja_efectivo', 'efectivo_externo', 'transferencia_empresa', 'otro'),
    allowNull: false,
    defaultValue: 'caja_efectivo'
  },
  pagadoPor: {
    type: DataTypes.STRING,
    allowNull: true
  },
  referencia: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'PagosCompra'
});

export = PagoCompra;
