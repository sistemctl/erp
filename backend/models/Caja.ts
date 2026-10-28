import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type EgresoCaja = require('./EgresoCaja');
import type Sede = require('./Sede');
import type Usuario = require('./Usuario');

interface CajaAttributes {
  arqueoDeclarado: Record<string, number> | null;
  ingresosAlCierre: { efectivo: number; nequi: number; daviplata: number; tarjeta: number; transferencia: number; extras: Record<string, number> } | null;
  id: string;
  sedeId: string;
  usuarioAperturaId: string;
  montoApertura: string | number;
  fecha: string;
  estado: 'abierta' | 'cerrada';
  usuarioCierreId: string | null;
  horaCierre: Date | null;
  totalVentasEfectivo: string | number | null;
  totalVentasNequi: string | number | null;
  totalVentasDaviplata: string | number | null;
  totalVentasTarjeta: string | number | null;
  totalVentasTransferencia: string | number | null;
  totalesPorMetodo: Record<string, number> | null;
  totalEgresos: string | number | null;
  diferencia: string | number | null;
  observaciones: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type CajaCreation = Optional<CajaAttributes, 'arqueoDeclarado' | 'ingresosAlCierre' | 'id' | 'montoApertura' | 'estado' | 'usuarioCierreId' | 'horaCierre' | 'totalVentasEfectivo' | 'totalVentasNequi' | 'totalVentasDaviplata' | 'totalVentasTarjeta' | 'totalVentasTransferencia' | 'totalesPorMetodo' | 'totalEgresos' | 'diferencia' | 'observaciones' | 'createdAt' | 'updatedAt'>;
interface Caja extends Model<CajaAttributes, CajaCreation>, CajaAttributes {
  egresos?: EgresoCaja[];
  sede?: Sede | null;
  usuarioApertura?: Usuario | null;
  usuarioCierre?: Usuario | null;
}


const Caja = sequelize.define<Caja, Omit<CajaAttributes, 'createdAt' | 'updatedAt'>>('Caja', {
  arqueoDeclarado: { type: DataTypes.JSONB, allowNull: true },
  ingresosAlCierre: { type: DataTypes.JSONB, allowNull: true },
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioAperturaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  montoApertura: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  fecha: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('abierta', 'cerrada'),
    defaultValue: 'abierta',
    allowNull: false
  },
  usuarioCierreId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  horaCierre: {
    type: DataTypes.DATE,
    allowNull: true
  },
  totalVentasEfectivo: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalVentasNequi: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalVentasDaviplata: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalVentasTarjeta: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalVentasTransferencia: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalesPorMetodo: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  totalEgresos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  diferencia: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'Cajas'
});

export = Caja;
