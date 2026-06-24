const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrdenReparacion = sequelize.define('OrdenReparacion', {
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
  tecnicoId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tipoEquipo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  marca: {
    type: DataTypes.STRING,
    allowNull: false
  },
  modelo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  imei: {
    type: DataTypes.STRING,
    allowNull: true
  },
  problemaReportado: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  diagnostico: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  costoManoObra: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  costoRepuestos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalCobrado: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('recibido', 'diagnostico', 'en_reparacion', 'listo', 'entregado', 'cancelado'),
    defaultValue: 'recibido',
    allowNull: false
  },
  diasGarantia: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  fechaEstimadaEntrega: {
    type: DataTypes.DATE,
    allowNull: true
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notificacionEnviada: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'OrdenesReparacion'
});

module.exports = OrdenReparacion;
