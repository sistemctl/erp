const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ItemDevolucion = sequelize.define('ItemDevolucion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  devolucionId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  itemVentaId: {
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
  montoLinea: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'ItemsDevolucion'
});

module.exports = ItemDevolucion;
