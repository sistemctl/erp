import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Cliente = require('./Cliente');
import type Usuario = require('./Usuario');
import type Sede = require('./Sede');
import type MaterialInstalacion = require('./MaterialInstalacion');
import type Factura = require('./Factura');

interface OrdenInstalacionAttributes {
  id: string;
  numeroOrden: string;
  clienteId: string;
  sedeId: string;
  tecnicoId: string | null;
  sitio: string | null;
  direccion: string | null;
  descripcion: string | null;
  valorServicio: string | number | null;
  precioCerrado: boolean;
  costoMateriales: string | number | null;
  totalCobrado: string | number | null;
  estado: 'borrador' | 'en_proceso' | 'entregada' | 'cancelada';
  fechaProgramada: Date | null;
  observaciones: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type OrdenInstalacionCreation = Optional<OrdenInstalacionAttributes, 'id' | 'tecnicoId' | 'sitio' | 'direccion' | 'descripcion' | 'valorServicio' | 'precioCerrado' | 'costoMateriales' | 'totalCobrado' | 'estado' | 'fechaProgramada' | 'observaciones' | 'createdAt' | 'updatedAt'>;
interface OrdenInstalacion extends Model<OrdenInstalacionAttributes, OrdenInstalacionCreation>, OrdenInstalacionAttributes {
  cliente?: Cliente | null;
  tecnico?: Usuario | null;
  sede?: Sede | null;
  materiales?: MaterialInstalacion[];
  factura?: Factura | null;
}


const OrdenInstalacion = sequelize.define<OrdenInstalacion, Omit<OrdenInstalacionAttributes, 'createdAt' | 'updatedAt'>>('OrdenInstalacion', {
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
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tecnicoId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  sitio: {
    type: DataTypes.STRING,
    allowNull: true
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  valorServicio: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  /** Si true, el valor del servicio ya incluye materiales: totalCobrado = valorServicio */
  precioCerrado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  costoMateriales: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalCobrado: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('borrador', 'en_proceso', 'entregada', 'cancelada'),
    defaultValue: 'borrador',
    allowNull: false
  },
  fechaProgramada: {
    type: DataTypes.DATE,
    allowNull: true
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'OrdenesInstalacion'
});

export = OrdenInstalacion;
