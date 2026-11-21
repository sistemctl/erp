import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Usuario = require('./Usuario');
import type Sede = require('./Sede');
import type Nomina = require('./Nomina');

interface EmpleadoAttributes {
  id: string;
  usuarioId: string | null;
  nombre: string;
  documento: string;
  telefono: string | null;
  email: string | null;
  cargo: string | null;
  sedeId: string;
  tipoContrato: 'indefinido' | 'fijo' | 'prestacion_servicios';
  salarioBase: string | number;
  auxilioTransporte: boolean | null;
  fechaIngreso: Date;
  activo: boolean | null;
  cuentaBancaria: string | null;
  banco: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type EmpleadoCreation = Optional<EmpleadoAttributes, 'id' | 'usuarioId' | 'telefono' | 'email' | 'cargo' | 'salarioBase' | 'auxilioTransporte' | 'activo' | 'cuentaBancaria' | 'banco' | 'createdAt' | 'updatedAt'>;
interface Empleado extends Model<EmpleadoAttributes, EmpleadoCreation>, EmpleadoAttributes {
  usuario?: Usuario | null;
  sede?: Sede | null;
  nominas?: Nomina[];
}


const Empleado = sequelize.define<Empleado, Omit<EmpleadoAttributes, 'createdAt' | 'updatedAt'>>('Empleado', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  documento: {
    type: DataTypes.STRING,
    allowNull: false
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cargo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tipoContrato: {
    type: DataTypes.ENUM('indefinido', 'fijo', 'prestacion_servicios'),
    allowNull: false
  },
  salarioBase: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  auxilioTransporte: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  fechaIngreso: {
    type: DataTypes.DATE,
    allowNull: false
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  cuentaBancaria: {
    type: DataTypes.STRING,
    allowNull: true
  },
  banco: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'Empleados'
});

export = Empleado;
