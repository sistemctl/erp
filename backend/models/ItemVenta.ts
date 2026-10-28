import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Venta = require('./Venta');
import type Producto = require('./Producto');
import type NumeroSerie = require('./NumeroSerie');
import type ItemVentaComponente = require('./ItemVentaComponente');
import type ItemDevolucion = require('./ItemDevolucion');

interface ItemVentaAttributes {
  id: string;
  ventaId: string;
  productoId: string;
  numeroSerieId: string | null;
  cantidad: number;
  precioBase: string | number;
  precioModificado: string | number;
  descuentoPct: string | number;
  iva: string | number;
  ivaTotal: string | number | null;
  subtotal: string | number;
  autorizadoPorAdmin: boolean | null;
  cantidadDevuelta: number;
  createdAt: Date;
  updatedAt: Date;
}
type ItemVentaCreation = Optional<ItemVentaAttributes, 'id' | 'numeroSerieId' | 'cantidad' | 'precioBase' | 'precioModificado' | 'descuentoPct' | 'iva' | 'ivaTotal' | 'subtotal' | 'autorizadoPorAdmin' | 'cantidadDevuelta' | 'createdAt' | 'updatedAt'>;
interface ItemVenta extends Model<ItemVentaAttributes, ItemVentaCreation>, ItemVentaAttributes {
  venta?: Venta | null;
  producto?: Producto | null;
  numeroSerie?: NumeroSerie | null;
  componentesVendidos?: ItemVentaComponente[];
  devoluciones?: ItemDevolucion[];
}


const ItemVenta = sequelize.define<ItemVenta, Omit<ItemVentaAttributes, 'createdAt' | 'updatedAt'>>('ItemVenta', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ventaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productoId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  numeroSerieId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  precioBase: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  precioModificado: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  descuentoPct: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  iva: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  ivaTotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  subtotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  autorizadoPorAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  cantidadDevuelta: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'ItemsVenta'
});

export = ItemVenta;
