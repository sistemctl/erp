import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type OrdenReparacion = require('./OrdenReparacion');
import type Cliente = require('./Cliente');
import type Factura = require('./Factura');

interface NotificacionAttributes {
  id: string;
  ordenReparacionId: string | null;
  facturaId: string | null;
  clienteId: string;
  canal: 'sms' | 'whatsapp' | 'email';
  mensaje: string;
  estado: 'enviado' | 'fallido' | 'pendiente';
  errorDetalle: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type NotificacionCreation = Optional<NotificacionAttributes, 'id' | 'ordenReparacionId' | 'facturaId' | 'estado' | 'errorDetalle' | 'createdAt' | 'updatedAt'>;
interface Notificacion extends Model<NotificacionAttributes, NotificacionCreation>, NotificacionAttributes {
  orden?: OrdenReparacion | null;
  cliente?: Cliente | null;
  factura?: Factura | null;
}


const Notificacion = sequelize.define<Notificacion, Omit<NotificacionAttributes, 'createdAt' | 'updatedAt'>>('Notificacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ordenReparacionId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  facturaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  canal: {
    type: DataTypes.ENUM('sms', 'whatsapp', 'email'),
    allowNull: false
  },
  mensaje: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('enviado', 'fallido', 'pendiente'),
    defaultValue: 'pendiente',
    allowNull: false
  },
  errorDetalle: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'Notificaciones'
});

export = Notificacion;
