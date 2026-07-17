const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Venta = sequelize.define('Venta', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numeroVenta: {
    type: DataTypes.STRING,
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  subtotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  descuentoTotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  iva: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  esCredito: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  saldoPendiente: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('completada', 'credito', 'anulada'),
    defaultValue: 'completada',
    allowNull: false
  },
  /** ninguna | parcial | total — no pisa anulada */
  devolucionEstado: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ninguna'
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  /** Clave de idempotencia del cliente (evita doble venta en reintentos de red) */
  idempotencyKey: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true
  }
}, {
  tableName: 'Ventas'
});

module.exports = Venta;
