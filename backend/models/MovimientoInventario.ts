import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Producto = require('./Producto');
import type Sede = require('./Sede');
import type Usuario = require('./Usuario');

interface MovimientoInventarioAttributes {
  id: string;
  productoId: string;
  sedeId: string;
  tipo: 'entrada' | 'salida' | 'traslado_entrada' | 'traslado_salida' | 'ajuste';
  cantidad: number;
  motivo: string | null;
  referenciaId: string | null;
  usuarioId: string;
  createdAt: Date;
  updatedAt: Date;
}
type MovimientoInventarioCreation = Optional<MovimientoInventarioAttributes, 'id' | 'motivo' | 'referenciaId' | 'createdAt' | 'updatedAt'>;
interface MovimientoInventario extends Model<MovimientoInventarioAttributes, MovimientoInventarioCreation>, MovimientoInventarioAttributes {
  producto?: Producto | null;
  sede?: Sede | null;
  usuario?: Usuario | null;
}


const MovimientoInventario = sequelize.define<MovimientoInventario, Omit<MovimientoInventarioAttributes, 'createdAt' | 'updatedAt'>>('MovimientoInventario', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tipo: {
    type: DataTypes.ENUM('entrada', 'salida', 'traslado_entrada', 'traslado_salida', 'ajuste'),
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  motivo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  referenciaId: {
    type: DataTypes.UUID, // ID de la venta, orden de reparación o compra relacionada
    allowNull: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  tableName: 'MovimientosInventario'
});

export = MovimientoInventario;
