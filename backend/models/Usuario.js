const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const Usuario = sequelize.define('Usuario', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  rol: {
    type: DataTypes.ENUM('superadmin', 'admin', 'gerente_sede', 'cajero', 'tecnico', 'contador'),
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: true // admin puede no pertenecer a una sede específica
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Usuarios',
  hooks: {
    beforeSave: async (usuario) => {
      if (usuario.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        usuario.password = await bcrypt.hash(usuario.password, salt);
      }
    }
  }
});

// Método para verificar contraseña
Usuario.prototype.compararPassword = async function (passwordCandidata) {
  return bcrypt.compare(passwordCandidata, this.password);
};

module.exports = Usuario;
