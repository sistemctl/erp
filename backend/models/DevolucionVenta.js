const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DevolucionVenta = sequelize.define('DevolucionVenta', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numero: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cajaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  metodoReembolso: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'efectivo'
  }
}, {
  tableName: 'DevolucionesVenta'
});

module.exports = DevolucionVenta;
