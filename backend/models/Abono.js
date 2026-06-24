const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Abono = sequelize.define('Abono', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cuentaPorCobrarId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  metodo: {
    type: DataTypes.ENUM('efectivo', 'tarjeta', 'nequi', 'daviplata', 'transferencia'),
    allowNull: false
  },
  observaciones: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'Abonos'
});

module.exports = Abono;
