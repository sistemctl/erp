import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type CuentaPorCobrar = require('./CuentaPorCobrar');
import type Usuario = require('./Usuario');

interface AbonoAttributes {
  cajaId: string | null;
  anuladoAt: Date | null;
  id: string;
  cuentaPorCobrarId: string;
  usuarioId: string;
  monto: string | number;
  metodo: string;
  observaciones: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type AbonoCreation = Optional<AbonoAttributes, 'cajaId' | 'anuladoAt' | 'id' | 'monto' | 'observaciones' | 'createdAt' | 'updatedAt'>;
interface Abono extends Model<AbonoAttributes, AbonoCreation>, AbonoAttributes {
  cuentaPorCobrar?: CuentaPorCobrar | null;
  usuario?: Usuario | null;
}


const Abono = sequelize.define<Abono, Omit<AbonoAttributes, 'createdAt' | 'updatedAt'>>('Abono', {
  cajaId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'Cajas', key: 'id' }
  },
  anuladoAt: { type: DataTypes.DATE, allowNull: true },
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cuentaPorCobrarId: {
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
  metodo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  observaciones: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'Abonos'
});

export = Abono;
