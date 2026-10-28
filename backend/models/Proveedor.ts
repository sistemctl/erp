import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type OrdenCompra = require('./OrdenCompra');

interface ProveedorAttributes {
  id: string;
  nombre: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  banco: string | null;
  cuentaBancaria: string | null;
  activo: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
type ProveedorCreation = Optional<ProveedorAttributes, 'id' | 'contacto' | 'telefono' | 'email' | 'banco' | 'cuentaBancaria' | 'activo' | 'createdAt' | 'updatedAt'>;
interface Proveedor extends Model<ProveedorAttributes, ProveedorCreation>, ProveedorAttributes {
  ordenesCompra?: OrdenCompra[];
}


const Proveedor = sequelize.define<Proveedor, Omit<ProveedorAttributes, 'createdAt' | 'updatedAt'>>('Proveedor', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nit: {
    type: DataTypes.STRING,
    allowNull: false
  },
  contacto: {
    type: DataTypes.STRING,
    allowNull: true
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  banco: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cuentaBancaria: {
    type: DataTypes.STRING,
    allowNull: true
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Proveedores'
});

export = Proveedor;
