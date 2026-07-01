const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConfiguracionSistema = sequelize.define('ConfiguracionSistema', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empresa: {
    type: DataTypes.STRING,
    allowNull: false
  },
  logoUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  nit: {
    type: DataTypes.STRING,
    allowNull: true
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true
  },
  descuentoMaximoPct: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 10.00
  },
  egresoMaximoSinPin: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 50000.00
  },
  notificacionesActivas: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  smsActivo: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  whatsappActivo: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  twilioAccountSid: {
    type: DataTypes.STRING,
    allowNull: true
  },
  twilioAuthToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  twilioFromNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ivaDefecto: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 19.00
  },
  cobrarIvaPos: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  templateRecibido: {
    type: DataTypes.TEXT,
    defaultValue: "Hola {cliente}, recibimos tu {equipo} en la sede {sede} bajo la orden #{orden}."
  },
  templateListo: {
    type: DataTypes.TEXT,
    defaultValue: "Hola {cliente}, tu {equipo} (orden #{orden}) ya está listo para retirar en la sede {sede}. Total: {total}."
  },
  templateEntregado: {
    type: DataTypes.TEXT,
    defaultValue: "Hola {cliente}, se ha entregado tu {equipo} (orden #{orden}). ¡Gracias por confiar en TechStore!"
  },
  temaInterfaz: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null
  },
  nominaFrecuenciaDefault: {
    type: DataTypes.ENUM('quincenal', 'mensual'),
    defaultValue: 'quincenal'
  },
  nominaDiaCorteQuincena: {
    type: DataTypes.INTEGER,
    defaultValue: 15
  },
  nominaDiaPago1: {
    type: DataTypes.INTEGER,
    defaultValue: 15
  },
  nominaDiaPago2: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  puertoServidor: {
    type: DataTypes.INTEGER,
    defaultValue: 3000,
    allowNull: false
  }
}, {
  tableName: 'ConfiguracionesSistema'
});

module.exports = ConfiguracionSistema;
