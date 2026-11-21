import { DataTypes, type Model, type Optional } from 'sequelize';
import sequelize = require('../config/database');
import type NumeroSerie = require('./NumeroSerie');
import type Sede = require('./Sede');
import type Venta = require('./Venta');
import type Cotizacion = require('./Cotizacion');
import type OrdenReparacion = require('./OrdenReparacion');
import type OrdenInstalacion = require('./OrdenInstalacion');
import type TradeIn = require('./TradeIn');
import type Factura = require('./Factura');
import type CuentaPorCobrar = require('./CuentaPorCobrar');
import type Notificacion = require('./Notificacion');

interface ClienteAttributes {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  documento: string | null;
  direccion: string | null;
  sedeId: string;
  createdAt: Date;
  updatedAt: Date;
}
type ClienteCreation = Optional<ClienteAttributes, 'id' | 'telefono' | 'email' | 'documento' | 'direccion' | 'createdAt' | 'updatedAt'>;
interface Cliente extends Model<ClienteAttributes, ClienteCreation>, ClienteAttributes {
  numerosSerie?: NumeroSerie[];
  sede?: Sede | null;
  ventas?: Venta[];
  cotizaciones?: Cotizacion[];
  ordenesReparacion?: OrdenReparacion[];
  ordenesInstalacion?: OrdenInstalacion[];
  tradeIns?: TradeIn[];
  facturas?: Factura[];
  cuentasPorCobrar?: CuentaPorCobrar[];
  notificaciones?: Notificacion[];
}


const Cliente = sequelize.define<Cliente, Omit<ClienteAttributes, 'createdAt' | 'updatedAt'>>('Cliente', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  documento: {
    type: DataTypes.STRING,
    allowNull: true
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  sedeId: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  tableName: 'Clientes'
});

export = Cliente;
