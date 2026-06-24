const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Caja = sequelize.define('Caja', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioAperturaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  montoApertura: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  fecha: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('abierta', 'cerrada'),
    defaultValue: 'abierta',
    allowNull: false
  },
  usuarioCierreId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  horaCierre: {
    type: DataTypes.DATE,
    allowNull: true
  },
  totalVentasEfectivo: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalVentasNequi: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalVentasDaviplata: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalVentasTarjeta: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalVentasTransferencia: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalEgresos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  diferencia: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'Cajas'
});

module.exports = Caja;
