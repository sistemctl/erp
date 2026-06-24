const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrdenCompra = sequelize.define('OrdenCompra', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  proveedorId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('pendiente', 'recibida', 'parcial', 'cancelada'),
    defaultValue: 'pendiente',
    allowNull: false
  },
  estadoPago: {
    type: DataTypes.ENUM('pendiente', 'abono_parcial', 'pagado'),
    defaultValue: 'pendiente',
    allowNull: false
  },
  fechaVencimientoPago: {
    type: DataTypes.DATE,
    allowNull: true
  },
  saldoPendiente: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    allowNull: false
  },
  fechaEsperada: {
    type: DataTypes.DATE,
    allowNull: true
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'OrdenesCompra'
});

module.exports = OrdenCompra;
