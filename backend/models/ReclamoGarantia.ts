import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Sede = require('./Sede');
import type Cliente = require('./Cliente');
import type Producto = require('./Producto');
import type Usuario = require('./Usuario');
import type Venta = require('./Venta');
import type NumeroSerie = require('./NumeroSerie');
import type OrdenReparacion = require('./OrdenReparacion');

interface ReclamoGarantiaAttributes {
  id: string;
  numero: string;
  serie: string;
  numeroSerieId: string | null;
  productoId: string | null;
  clienteId: string | null;
  sedeId: string;
  ventaId: string | null;
  usuarioId: string;
  motivo: string;
  estado: 'abierto' | 'en_revision' | 'aprobado' | 'rechazado' | 'cerrado';
  diasGarantia: number | null;
  fechaVenta: Date | null;
  fechaVenceGarantia: Date | null;
  dentroDeGarantia: boolean | null;
  observaciones: string | null;
  ordenReparacionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type ReclamoGarantiaCreation = Optional<ReclamoGarantiaAttributes, 'id' | 'numeroSerieId' | 'productoId' | 'clienteId' | 'ventaId' | 'estado' | 'diasGarantia' | 'fechaVenta' | 'fechaVenceGarantia' | 'dentroDeGarantia' | 'observaciones' | 'ordenReparacionId' | 'createdAt' | 'updatedAt'>;
interface ReclamoGarantia extends Model<ReclamoGarantiaAttributes, ReclamoGarantiaCreation>, ReclamoGarantiaAttributes {
  sede?: Sede | null;
  cliente?: Cliente | null;
  producto?: Producto | null;
  usuario?: Usuario | null;
  venta?: Venta | null;
  numeroSerie?: NumeroSerie | null;
  ordenReparacion?: OrdenReparacion | null;
}


const ReclamoGarantia = sequelize.define<ReclamoGarantia, Omit<ReclamoGarantiaAttributes, 'createdAt' | 'updatedAt'>>('ReclamoGarantia', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numero: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  serie: {
    type: DataTypes.STRING,
    allowNull: false
  },
  numeroSerieId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('abierto', 'en_revision', 'aprobado', 'rechazado', 'cerrado'),
    defaultValue: 'abierto',
    allowNull: false
  },
  diasGarantia: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  fechaVenta: {
    type: DataTypes.DATE,
    allowNull: true
  },
  fechaVenceGarantia: {
    type: DataTypes.DATE,
    allowNull: true
  },
  dentroDeGarantia: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ordenReparacionId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'ReclamosGarantia'
});

export = ReclamoGarantia;
