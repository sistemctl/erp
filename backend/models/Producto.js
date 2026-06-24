const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Producto = sequelize.define('Producto', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  codigoBarras: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  precioVenta: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  precioCosto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  tieneIVA: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  stockMinimo: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  tieneNumeroSerie: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  esReacondicionado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  categoriaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Productos'
});

module.exports = Producto;
