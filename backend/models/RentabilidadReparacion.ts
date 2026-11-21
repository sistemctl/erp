import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type OrdenReparacion = require('./OrdenReparacion');

interface RentabilidadReparacionAttributes {
  id: string;
  ordenId: string;
  costoReal: string | number;
  totalCobrado: string | number;
  margen: string | number;
  createdAt: Date;
  updatedAt: Date;
}
type RentabilidadReparacionCreation = Optional<RentabilidadReparacionAttributes, 'id' | 'costoReal' | 'totalCobrado' | 'margen' | 'createdAt' | 'updatedAt'>;
interface RentabilidadReparacion extends Model<RentabilidadReparacionAttributes, RentabilidadReparacionCreation>, RentabilidadReparacionAttributes {
  orden?: OrdenReparacion | null;
}


const RentabilidadReparacion = sequelize.define<RentabilidadReparacion, Omit<RentabilidadReparacionAttributes, 'createdAt' | 'updatedAt'>>('RentabilidadReparacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  costoReal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  totalCobrado: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  margen: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'RentabilidadReparaciones'
});

export = RentabilidadReparacion;
