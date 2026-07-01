const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PagoCompra = sequelize.define('PagoCompra', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenCompraId: {
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
  fuenteFondos: {
    type: DataTypes.ENUM('caja_efectivo', 'efectivo_externo', 'transferencia_empresa', 'otro'),
    allowNull: false,
    defaultValue: 'caja_efectivo'
  },
  pagadoPor: {
    type: DataTypes.STRING,
    allowNull: true
  },
  referencia: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'PagosCompra'
});

module.exports = PagoCompra;
