const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ItemOrdenCompra = sequelize.define('ItemOrdenCompra', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenCompraId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cantidadPedida: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  cantidadRecibida: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  precioUnitario: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'ItemsOrdenCompra'
});

module.exports = ItemOrdenCompra;
