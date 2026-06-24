const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NumeroSerie = sequelize.define('NumeroSerie', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  serie: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('en_stock', 'vendido', 'en_reparacion', 'reacondicionado'),
    defaultValue: 'en_stock',
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  fechaVenta: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'NumerosSerie'
});

module.exports = NumeroSerie;
