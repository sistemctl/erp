const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ItemCotizacion = sequelize.define('ItemCotizacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cotizacionId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  descripcion: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  precioUnitario: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  subtotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'ItemsCotizacion'
});

module.exports = ItemCotizacion;
