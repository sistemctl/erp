const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Nomina = sequelize.define('Nomina', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empleadoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  periodo: {
    type: DataTypes.STRING, // Quincenal: YYYY-MM-15 (1.ª) o YYYY-MM-30 (2.ª)
    allowNull: false
  },
  tipoPeriodo: {
    type: DataTypes.ENUM('quincenal', 'mensual'),
    allowNull: false
  },
  salarioBase: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  auxilioTransporte: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  horasExtra: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  recargosNocturnos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  dominicales: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  bonos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  deduccionEPS: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  deduccionPension: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  deduccionPrestamos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalDevengado: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalDeducciones: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  neto: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('borrador', 'aprobada', 'pagada'),
    defaultValue: 'borrador',
    allowNull: false
  }
}, {
  tableName: 'Nominas'
});

module.exports = Nomina;
