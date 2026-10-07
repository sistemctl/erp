const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ItemVentaComponente = sequelize.define('ItemVentaComponente', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  itemVentaId: {
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
    defaultValue: 1,
    validate: { min: 1 }
  },
  /** Identifica a cuál unidad del combo pertenece el componente. */
  unidadCombo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1 }
  },
  numeroSerieId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  devuelto: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'ItemsVentaComponentes'
});

module.exports = ItemVentaComponente;
