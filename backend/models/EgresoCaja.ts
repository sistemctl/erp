import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Caja = require('./Caja');
import type Usuario = require('./Usuario');
import type CategoriaEgreso = require('./CategoriaEgreso');
import type PagoCompra = require('./PagoCompra');

interface EgresoCajaAttributes {
  id: string;
  cajaId: string;
  usuarioId: string;
  categoriaId: string;
  monto: string | number;
  motivo: string;
  requirioPin: boolean | null;
  autorizadoPor: string | null;
  pagoCompraId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type EgresoCajaCreation = Optional<EgresoCajaAttributes, 'id' | 'monto' | 'requirioPin' | 'autorizadoPor' | 'pagoCompraId' | 'createdAt' | 'updatedAt'>;
interface EgresoCaja extends Model<EgresoCajaAttributes, EgresoCajaCreation>, EgresoCajaAttributes {
  caja?: Caja | null;
  usuario?: Usuario | null;
  categoria?: CategoriaEgreso | null;
  autorizador?: Usuario | null;
  pagoCompra?: PagoCompra | null;
}


const EgresoCaja = sequelize.define<EgresoCaja, Omit<EgresoCajaAttributes, 'createdAt' | 'updatedAt'>>('EgresoCaja', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cajaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  categoriaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  requirioPin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  autorizadoPor: {
    type: DataTypes.UUID,
    allowNull: true
  },
  pagoCompraId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'EgresosCaja'
});

export = EgresoCaja;
