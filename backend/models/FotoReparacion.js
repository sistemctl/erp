const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FotoReparacion = sequelize.define('FotoReparacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  momento: {
    type: DataTypes.ENUM('recepcion', 'entrega'),
    allowNull: false
  }
}, {
  tableName: 'FotosReparacion'
});

module.exports = FotoReparacion;
