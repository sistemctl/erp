import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Cliente = require('./Cliente');
import type Usuario = require('./Usuario');
import type Sede = require('./Sede');
import type Venta = require('./Venta');
import type OrdenReparacion = require('./OrdenReparacion');
import type ItemCotizacion = require('./ItemCotizacion');

interface CotizacionAttributes {
  id: string;
  numeroCotizacion: string;
  clienteId: string;
  usuarioId: string;
  sedeId: string;
  total: string | number;
  estado: 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'expirada';
  fechaVencimiento: Date;
  notas: string | null;
  ventaId: string | null;
  ordenReparacionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type CotizacionCreation = Optional<CotizacionAttributes, 'id' | 'total' | 'estado' | 'notas' | 'ventaId' | 'ordenReparacionId' | 'createdAt' | 'updatedAt'>;
interface Cotizacion extends Model<CotizacionAttributes, CotizacionCreation>, CotizacionAttributes {
  cliente?: Cliente | null;
  usuario?: Usuario | null;
  sede?: Sede | null;
  venta?: Venta | null;
  ordenReparacion?: OrdenReparacion | null;
  items?: ItemCotizacion[];
}


const Cotizacion = sequelize.define<Cotizacion, Omit<CotizacionAttributes, 'createdAt' | 'updatedAt'>>('Cotizacion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  numeroCotizacion: {
    type: DataTypes.STRING,
    allowNull: false
  },
  clienteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  estado: {
    type: DataTypes.ENUM('borrador', 'enviada', 'aprobada', 'rechazada', 'expirada'),
    defaultValue: 'borrador',
    allowNull: false
  },
  fechaVencimiento: {
    type: DataTypes.DATE,
    allowNull: false
  },
  notas: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  ordenReparacionId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'Cotizaciones'
});

export = Cotizacion;
