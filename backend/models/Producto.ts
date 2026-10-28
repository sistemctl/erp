import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Categoria = require('./Categoria');
import type StockSede = require('./StockSede');
import type NumeroSerie = require('./NumeroSerie');
import type ItemVenta = require('./ItemVenta');
import type ComboComponente = require('./ComboComponente');
import type ItemCotizacion = require('./ItemCotizacion');
import type RepuestoOrden = require('./RepuestoOrden');
import type MaterialInstalacion = require('./MaterialInstalacion');
import type ItemOrdenCompra = require('./ItemOrdenCompra');
import type MovimientoInventario = require('./MovimientoInventario');

interface ProductoAttributes {
  id: string;
  nombre: string;
  codigoBarras: string;
  descripcion: string | null;
  precioVenta: string | number;
  precioCosto: string | number;
  tieneIVA: boolean | null;
  stockMinimo: number | null;
  tieneNumeroSerie: boolean | null;
  esServicio: boolean | null;
  esCombo: boolean | null;
  unidadMedida: string;
  esReacondicionado: boolean | null;
  categoriaId: string;
  imagenUrl: string | null;
  activo: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
type ProductoCreation = Optional<ProductoAttributes, 'id' | 'descripcion' | 'precioVenta' | 'precioCosto' | 'tieneIVA' | 'stockMinimo' | 'tieneNumeroSerie' | 'esServicio' | 'esCombo' | 'unidadMedida' | 'esReacondicionado' | 'imagenUrl' | 'activo' | 'createdAt' | 'updatedAt'>;
interface Producto extends Model<ProductoAttributes, ProductoCreation>, ProductoAttributes {
  categoria?: Categoria | null;
  stocks?: StockSede[];
  numerosSerie?: NumeroSerie[];
  itemsVenta?: ItemVenta[];
  componentes?: ComboComponente[];
  itemsCotizacion?: ItemCotizacion[];
  repuestosEnOrdenes?: RepuestoOrden[];
  materialesEnInstalaciones?: MaterialInstalacion[];
  compras?: ItemOrdenCompra[];
  movimientos?: MovimientoInventario[];
}


const Producto = sequelize.define<Producto, Omit<ProductoAttributes, 'createdAt' | 'updatedAt'>>('Producto', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  codigoBarras: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  precioVenta: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  precioCosto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  tieneIVA: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  stockMinimo: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  tieneNumeroSerie: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  /** Servicio (mano de obra / instalación): no descuenta StockSede */
  esServicio: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  /** Combo virtual: se vende como una línea y descuenta sus componentes. */
  esCombo: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  /**
   * Unidad de medida del stock y precios.
   * `m` = 1 unidad de inventario equivale a 1 metro (cable, etc.).
   */
  unidadMedida: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'und',
    validate: {
      isIn: [['und', 'm']]
    }
  },
  esReacondicionado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  categoriaId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  imagenUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Productos'
});

export = Producto;
