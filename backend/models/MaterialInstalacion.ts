import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type OrdenInstalacion = require('./OrdenInstalacion');
import type Producto = require('./Producto');

interface MaterialInstalacionAttributes {
  id: string;
  ordenId: string;
  productoId: string;
  cantidad: number;
  costoUnitario: string | number;
  precioUnitario: string | number;
  series: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}
type MaterialInstalacionCreation = Optional<MaterialInstalacionAttributes, 'id' | 'cantidad' | 'costoUnitario' | 'precioUnitario' | 'series' | 'createdAt' | 'updatedAt'>;
interface MaterialInstalacion extends Model<MaterialInstalacionAttributes, MaterialInstalacionCreation>, MaterialInstalacionAttributes {
  orden?: OrdenInstalacion | null;
  producto?: Producto | null;
}


const MaterialInstalacion = sequelize.define<MaterialInstalacion, Omit<MaterialInstalacionAttributes, 'createdAt' | 'updatedAt'>>('MaterialInstalacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  costoUnitario: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  precioUnitario: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  /** Series/IMEI usados (strings) cuando el producto tieneNumeroSerie */
  series: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null
  }
}, {
  tableName: 'MaterialesInstalacion'
});

export = MaterialInstalacion;
