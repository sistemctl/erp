import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type Usuario = require('./Usuario');
import type StockSede = require('./StockSede');
import type NumeroSerie = require('./NumeroSerie');
import type Cliente = require('./Cliente');
import type Venta = require('./Venta');
import type DevolucionVenta = require('./DevolucionVenta');
import type Cotizacion = require('./Cotizacion');
import type OrdenReparacion = require('./OrdenReparacion');
import type OrdenInstalacion = require('./OrdenInstalacion');
import type TradeIn = require('./TradeIn');
import type Caja = require('./Caja');
import type Factura = require('./Factura');
import type Empleado = require('./Empleado');
import type OrdenCompra = require('./OrdenCompra');
import type MovimientoInventario = require('./MovimientoInventario');

interface SedeAttributes {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string | null;
  activa: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
type SedeCreation = Optional<SedeAttributes, 'id' | 'telefono' | 'activa' | 'createdAt' | 'updatedAt'>;
interface Sede extends Model<SedeAttributes, SedeCreation>, SedeAttributes {
  usuarios?: Usuario[];
  stocks?: StockSede[];
  numerosSerie?: NumeroSerie[];
  clientes?: Cliente[];
  ventas?: Venta[];
  devolucionesVenta?: DevolucionVenta[];
  cotizaciones?: Cotizacion[];
  ordenesReparacion?: OrdenReparacion[];
  ordenesInstalacion?: OrdenInstalacion[];
  tradeIns?: TradeIn[];
  cajas?: Caja[];
  facturas?: Factura[];
  empleados?: Empleado[];
  ordenesCompra?: OrdenCompra[];
  movimientos?: MovimientoInventario[];
}


const Sede = sequelize.define<Sede, Omit<SedeAttributes, 'createdAt' | 'updatedAt'>>('Sede', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: false
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true
  },
  activa: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Sedes'
});

export = Sede;
