const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: true // Puede ser null en caso de fallos de login u operaciones externas
  },
  accion: {
    type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'PRICE_OVERRIDE', 'EGRESO_CAJA'),
    allowNull: false
  },
  modulo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  registroId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  valorAnterior: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  valorNuevo: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'AuditLogs'
});

module.exports = AuditLog;
