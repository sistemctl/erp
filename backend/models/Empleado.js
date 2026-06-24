const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Empleado = sequelize.define('Empleado', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  documento: {
    type: DataTypes.STRING,
    allowNull: false
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cargo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tipoContrato: {
    type: DataTypes.ENUM('indefinido', 'fijo', 'prestacion_servicios'),
    allowNull: false
  },
  salarioBase: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  auxilioTransporte: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  fechaIngreso: {
    type: DataTypes.DATE,
    allowNull: false
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  cuentaBancaria: {
    type: DataTypes.STRING,
    allowNull: true
  },
  banco: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'Empleados'
});

module.exports = Empleado;
