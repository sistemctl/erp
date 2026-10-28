import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Cotizacion = require('./Cotizacion');
import type Cliente = require('./Cliente');
import type Usuario = require('./Usuario');
import type Sede = require('./Sede');
import type FotoReparacion = require('./FotoReparacion');
import type RepuestoOrden = require('./RepuestoOrden');
import type RentabilidadReparacion = require('./RentabilidadReparacion');
import type Factura = require('./Factura');
import type Notificacion = require('./Notificacion');

interface OrdenReparacionAttributes {
  id: string;
  numeroOrden: string;
  tokenPublico: string;
  clienteId: string;
  tecnicoId: string | null;
  sedeId: string;
  modalidad: 'taller' | 'domicilio';
  direccionServicio: string | null;
  tipoEquipo: string;
  marca: string;
  modelo: string;
  imei: string | null;
  problemaReportado: string;
  diagnostico: string | null;
  costoManoObra: string | number | null;
  costoRepuestos: string | number | null;
  totalCobrado: string | number | null;
  estado: 'recibido' | 'diagnostico' | 'en_reparacion' | 'listo' | 'entregado' | 'cancelado';
  diasGarantia: number | null;
  fechaEstimadaEntrega: Date | null;
  observaciones: string | null;
  notificacionEnviada: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
type OrdenReparacionCreation = Optional<OrdenReparacionAttributes, 'id' | 'tokenPublico' | 'tecnicoId' | 'modalidad' | 'direccionServicio' | 'imei' | 'diagnostico' | 'costoManoObra' | 'costoRepuestos' | 'totalCobrado' | 'estado' | 'diasGarantia' | 'fechaEstimadaEntrega' | 'observaciones' | 'notificacionEnviada' | 'createdAt' | 'updatedAt'>;
interface OrdenReparacion extends Model<OrdenReparacionAttributes, OrdenReparacionCreation>, OrdenReparacionAttributes {
  cotizacion?: Cotizacion | null;
  cliente?: Cliente | null;
  tecnico?: Usuario | null;
  sede?: Sede | null;
  fotos?: FotoReparacion[];
  repuestos?: RepuestoOrden[];
  rentabilidad?: RentabilidadReparacion | null;
  factura?: Factura | null;
  notificaciones?: Notificacion[];
}


const OrdenReparacion = sequelize.define<OrdenReparacion, Omit<OrdenReparacionAttributes, 'createdAt' | 'updatedAt'>>('OrdenReparacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numeroOrden: {
    type: DataTypes.STRING,
    allowNull: false
  },
  /** Token opaco para seguimiento público (QR); no adivinable */
  tokenPublico: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false,
    unique: true
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tecnicoId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  modalidad: {
    type: DataTypes.ENUM('taller', 'domicilio'),
    defaultValue: 'taller',
    allowNull: false
  },
  direccionServicio: {
    type: DataTypes.STRING,
    allowNull: true
  },
  tipoEquipo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  marca: {
    type: DataTypes.STRING,
    allowNull: false
  },
  modelo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  imei: {
    type: DataTypes.STRING,
    allowNull: true
  },
  problemaReportado: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  diagnostico: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  costoManoObra: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  costoRepuestos: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalCobrado: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('recibido', 'diagnostico', 'en_reparacion', 'listo', 'entregado', 'cancelado'),
    defaultValue: 'recibido',
    allowNull: false
  },
  diasGarantia: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  fechaEstimadaEntrega: {
    type: DataTypes.DATE,
    allowNull: true
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notificacionEnviada: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'OrdenesReparacion'
});

export = OrdenReparacion;
