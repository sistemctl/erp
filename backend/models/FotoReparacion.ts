import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type OrdenReparacion = require('./OrdenReparacion');

interface FotoReparacionAttributes {
  id: string;
  ordenId: string;
  url: string;
  momento: 'recepcion' | 'entrega';
  createdAt: Date;
  updatedAt: Date;
}
type FotoReparacionCreation = Optional<FotoReparacionAttributes, 'id' | 'createdAt' | 'updatedAt'>;
interface FotoReparacion extends Model<FotoReparacionAttributes, FotoReparacionCreation>, FotoReparacionAttributes {
  orden?: OrdenReparacion | null;
}


const FotoReparacion = sequelize.define<FotoReparacion, Omit<FotoReparacionAttributes, 'createdAt' | 'updatedAt'>>('FotoReparacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  momento: {
    type: DataTypes.ENUM('recepcion', 'entrega'),
    allowNull: false
  }
}, {
  tableName: 'FotosReparacion'
});

export = FotoReparacion;
