const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notificacion = sequelize.define('Notificacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenReparacionId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  canal: {
    type: DataTypes.ENUM('sms', 'whatsapp'),
    allowNull: false
  },
  mensaje: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('enviado', 'fallido', 'pendiente'),
    defaultValue: 'pendiente',
    allowNull: false
  },
  errorDetalle: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'Notificaciones'
});

module.exports = Notificacion;
