import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Empleado = require('./Empleado');

interface NominaAttributes {
  id: string;
  empleadoId: string;
  periodo: string;
  tipoPeriodo: 'quincenal' | 'mensual';
  salarioBase: string | number;
  auxilioTransporte: string | number | null;
  horasExtra: string | number | null;
  recargosNocturnos: string | number | null;
  dominicales: string | number | null;
  bonos: string | number | null;
  deduccionEPS: string | number | null;
  deduccionPension: string | number | null;
  deduccionPrestamos: string | number | null;
  totalDevengado: string | number | null;
  totalDeducciones: string | number | null;
  neto: string | number | null;
  estado: 'borrador' | 'aprobada' | 'pagada';
  createdAt: Date;
  updatedAt: Date;
}
type NominaCreation = Optional<NominaAttributes, 'id' | 'salarioBase' | 'auxilioTransporte' | 'horasExtra' | 'recargosNocturnos' | 'dominicales' | 'bonos' | 'deduccionEPS' | 'deduccionPension' | 'deduccionPrestamos' | 'totalDevengado' | 'totalDeducciones' | 'neto' | 'estado' | 'createdAt' | 'updatedAt'>;
interface Nomina extends Model<NominaAttributes, NominaCreation>, NominaAttributes {
  empleado?: Empleado | null;
}


const Nomina = sequelize.define<Nomina, Omit<NominaAttributes, 'createdAt' | 'updatedAt'>>('Nomina', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empleadoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  periodo: {
    type: DataTypes.STRING, // Quincenal: YYYY-MM-15 (1.ª) o YYYY-MM-30 (2.ª)
    allowNull: false
  },
  tipoPeriodo: {
    type: DataTypes.ENUM('quincenal', 'mensual'),
    allowNull: false
  },
  salarioBase: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  auxilioTransporte: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  horasExtra: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  recargosNocturnos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  dominicales: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  bonos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  deduccionEPS: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  deduccionPension: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  deduccionPrestamos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalDevengado: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalDeducciones: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  neto: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('borrador', 'aprobada', 'pagada'),
    defaultValue: 'borrador',
    allowNull: false
  }
}, {
  tableName: 'Nominas'
});

export = Nomina;
