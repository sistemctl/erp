const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EgresoCaja = sequelize.define('EgresoCaja', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cajaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  categoriaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  requirioPin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  autorizadoPor: {
    type: DataTypes.UUID,
    allowNull: true
  },
  pagoCompraId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'EgresosCaja'
});

module.exports = EgresoCaja;
