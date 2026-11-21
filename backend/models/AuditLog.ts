import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Usuario = require('./Usuario');
import type Sede = require('./Sede');

interface AuditLogAttributes {
  id: string;
  usuarioId: string | null;
  accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'PRICE_OVERRIDE' | 'EGRESO_CAJA';
  modulo: string;
  registroId: string | null;
  valorAnterior: unknown;
  valorNuevo: unknown;
  sedeId: string | null;
  ip: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type AuditLogCreation = Optional<AuditLogAttributes, 'id' | 'usuarioId' | 'registroId' | 'valorAnterior' | 'valorNuevo' | 'sedeId' | 'ip' | 'createdAt' | 'updatedAt'>;
interface AuditLog extends Model<AuditLogAttributes, AuditLogCreation>, AuditLogAttributes {
  usuario?: Usuario | null;
  sede?: Sede | null;
}


const AuditLog = sequelize.define<AuditLog, Omit<AuditLogAttributes, 'createdAt' | 'updatedAt'>>('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: true // Puede ser null en caso de fallos de login u operaciones externas
  },
  accion: {
    type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'PRICE_OVERRIDE', 'EGRESO_CAJA'),
    allowNull: false
  },
  modulo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  registroId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  valorAnterior: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  valorNuevo: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'AuditLogs'
});

export = AuditLog;
