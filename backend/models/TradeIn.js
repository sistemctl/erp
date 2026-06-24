const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TradeIn = sequelize.define('TradeIn', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  clienteId: {
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
  tipoEquipo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  marca: {
    type: DataTypes.STRING,
    allowNull: false
  },
  modelo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  imei: {
    type: DataTypes.STRING,
    allowNull: true
  },
  estadoFisico: {
    type: DataTypes.ENUM('excelente', 'bueno', 'regular', 'malo'),
    allowNull: false
  },
  valoracion: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  productoInventarioId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'TradeIns'
});

module.exports = TradeIn;
