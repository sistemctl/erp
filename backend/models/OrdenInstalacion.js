const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrdenInstalacion = sequelize.define('OrdenInstalacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numeroOrden: {
    type: DataTypes.STRING,
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tecnicoId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  sitio: {
    type: DataTypes.STRING,
    allowNull: true
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  valorServicio: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  costoMateriales: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalCobrado: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('borrador', 'en_proceso', 'entregada', 'cancelada'),
    defaultValue: 'borrador',
    allowNull: false
  },
  fechaProgramada: {
    type: DataTypes.DATE,
    allowNull: true
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'OrdenesInstalacion'
});

module.exports = OrdenInstalacion;
