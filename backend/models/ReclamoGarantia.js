const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReclamoGarantia = sequelize.define('ReclamoGarantia', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numero: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  serie: {
    type: DataTypes.STRING,
    allowNull: false
  },
  numeroSerieId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('abierto', 'en_revision', 'aprobado', 'rechazado', 'cerrado'),
    defaultValue: 'abierto',
    allowNull: false
  },
  diasGarantia: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  fechaVenta: {
    type: DataTypes.DATE,
    allowNull: true
  },
  fechaVenceGarantia: {
    type: DataTypes.DATE,
    allowNull: true
  },
  dentroDeGarantia: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ordenReparacionId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'ReclamosGarantia'
});

module.exports = ReclamoGarantia;
