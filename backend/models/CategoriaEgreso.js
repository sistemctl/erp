const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CategoriaEgreso = sequelize.define('CategoriaEgreso', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  descripcion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  activa: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'CategoriasEgreso'
});

module.exports = CategoriaEgreso;
