const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CuentaPorCobrar = sequelize.define('CuentaPorCobrar', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  facturaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  totalOriginal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  totalAbonado: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  saldoPendiente: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  fechaVencimiento: {
    type: DataTypes.DATE,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('al_dia', 'vencida', 'pagada'),
    defaultValue: 'al_dia',
    allowNull: false
  }
}, {
  tableName: 'CuentasPorCobrar'
});

module.exports = CuentaPorCobrar;
