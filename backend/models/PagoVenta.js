const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PagoVenta = sequelize.define('PagoVenta', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  metodo: {
    type: DataTypes.ENUM('efectivo', 'tarjeta', 'nequi', 'daviplata', 'transferencia', 'trade_in'),
    allowNull: false
  },
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'PagosVenta'
});

module.exports = PagoVenta;
