import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Sede = require('./Sede');
import type Venta = require('./Venta');
import type DevolucionVenta = require('./DevolucionVenta');
import type Cotizacion = require('./Cotizacion');
import type OrdenReparacion = require('./OrdenReparacion');
import type OrdenInstalacion = require('./OrdenInstalacion');
import type TradeIn = require('./TradeIn');
import type Abono = require('./Abono');
import type OrdenCompra = require('./OrdenCompra');

interface UsuarioAttributes {
  id: string;
  nombre: string;
  email: string;
  password: string;
  rol: 'superadmin' | 'admin' | 'gerente_sede' | 'cajero' | 'tecnico' | 'contador';
  sedeId: string | null;
  sessionVersion: number;
  activo: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
type UsuarioCreation = Optional<UsuarioAttributes, 'id' | 'sedeId' | 'sessionVersion' | 'activo' | 'createdAt' | 'updatedAt'>;
interface Usuario extends Model<UsuarioAttributes, UsuarioCreation>, UsuarioAttributes {
  sede?: Sede | null;
  ventas?: Venta[];
  devolucionesVenta?: DevolucionVenta[];
  cotizaciones?: Cotizacion[];
  ordenesAsignadas?: OrdenReparacion[];
  instalacionesAsignadas?: OrdenInstalacion[];
  tradeIns?: TradeIn[];
  abonos?: Abono[];
  ordenesCompra?: OrdenCompra[];
  compararPassword(passwordCandidata: string): Promise<boolean>;
}

import bcrypt = require('bcryptjs');

const Usuario = sequelize.define<Usuario, Omit<UsuarioAttributes, 'createdAt' | 'updatedAt'>>('Usuario', {
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
  sessionVersion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Usuarios',
  hooks: {
    beforeSave: async (usuario) => {
      if (!usuario.isNewRecord && (['password', 'rol', 'sedeId', 'activo'] as const).some((field) => usuario.changed(field))) {
        usuario.sessionVersion = (Number(usuario.sessionVersion) || 0) + 1;
      }
      if (usuario.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        usuario.password = await bcrypt.hash(usuario.password, salt);
      }
    }
  }
});

// Método para verificar contraseña
(Usuario.prototype as Usuario).compararPassword = async function (this: Usuario, passwordCandidata: string) {
  return bcrypt.compare(passwordCandidata, this.password);
};

export = Usuario;
