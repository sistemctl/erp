const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MovimientoInventario = sequelize.define('MovimientoInventario', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tipo: {
    type: DataTypes.ENUM('entrada', 'salida', 'traslado_entrada', 'traslado_salida', 'ajuste'),
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  motivo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  referenciaId: {
    type: DataTypes.UUID, // ID de la venta, orden de reparación o compra relacionada
    allowNull: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  tableName: 'MovimientosInventario'
});

module.exports = MovimientoInventario;
