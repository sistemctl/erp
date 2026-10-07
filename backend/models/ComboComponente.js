const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ComboComponente = sequelize.define('ComboComponente', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  comboId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1 }
  }
}, {
  tableName: 'ComboComponentes',
  indexes: [{ unique: true, fields: ['comboId', 'productoId'] }]
});

module.exports = ComboComponente;
