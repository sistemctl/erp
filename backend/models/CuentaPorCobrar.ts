import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Factura = require('./Factura');
import type Cliente = require('./Cliente');
import type Abono = require('./Abono');

interface CuentaPorCobrarAttributes {
  anuladaAt: Date | null;
  id: string;
  facturaId: string;
  clienteId: string;
  pagadorExterno: string | null;
  esRecaudoExterno: boolean;
  totalOriginal: string | number;
  totalAbonado: string | number | null;
  saldoPendiente: string | number;
  fechaVencimiento: Date;
  estado: 'al_dia' | 'vencida' | 'pagada';
  createdAt: Date;
  updatedAt: Date;
}
type CuentaPorCobrarCreation = Optional<CuentaPorCobrarAttributes, 'anuladaAt' | 'id' | 'pagadorExterno' | 'esRecaudoExterno' | 'totalOriginal' | 'totalAbonado' | 'saldoPendiente' | 'estado' | 'createdAt' | 'updatedAt'>;
interface CuentaPorCobrar extends Model<CuentaPorCobrarAttributes, CuentaPorCobrarCreation>, CuentaPorCobrarAttributes {
  factura?: Factura | null;
  cliente?: Cliente | null;
  abonos?: Abono[];
}


const CuentaPorCobrar = sequelize.define<CuentaPorCobrar, Omit<CuentaPorCobrarAttributes, 'createdAt' | 'updatedAt'>>('CuentaPorCobrar', {
  anuladaAt: { type: DataTypes.DATE, allowNull: true },
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  facturaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  /** Financiador que liquida la venta, distinto al cliente final. */
  pagadorExterno: {
    type: DataTypes.STRING,
    allowNull: true
  },
  esRecaudoExterno: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  totalOriginal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  totalAbonado: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  saldoPendiente: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  fechaVencimiento: {
    type: DataTypes.DATE,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('al_dia', 'vencida', 'pagada'),
    defaultValue: 'al_dia',
    allowNull: false
  }
}, {
  tableName: 'CuentasPorCobrar'
});

export = CuentaPorCobrar;
