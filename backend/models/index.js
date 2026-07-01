const sequelize = require('../config/database');
const { Sequelize } = require('sequelize');

// Importar Modelos
const Sede = require('./Sede');
const Usuario = require('./Usuario');
const Categoria = require('./Categoria');
const Producto = require('./Producto');
const StockSede = require('./StockSede');
const NumeroSerie = require('./NumeroSerie');
const Cliente = require('./Cliente');
const Venta = require('./Venta');
const ItemVenta = require('./ItemVenta');
const PagoVenta = require('./PagoVenta');
const Cotizacion = require('./Cotizacion');
const ItemCotizacion = require('./ItemCotizacion');
const OrdenReparacion = require('./OrdenReparacion');
const FotoReparacion = require('./FotoReparacion');
const RepuestoOrden = require('./RepuestoOrden');
const RentabilidadReparacion = require('./RentabilidadReparacion');
const TradeIn = require('./TradeIn');
const CategoriaEgreso = require('./CategoriaEgreso');
const EgresoCaja = require('./EgresoCaja');
const Caja = require('./Caja');
const Factura = require('./Factura');
const CuentaPorCobrar = require('./CuentaPorCobrar');
const Abono = require('./Abono');
const Empleado = require('./Empleado');
const Nomina = require('./Nomina');
const Proveedor = require('./Proveedor');
const OrdenCompra = require('./OrdenCompra');
const ItemOrdenCompra = require('./ItemOrdenCompra');
const PagoCompra = require('./PagoCompra');
const MovimientoInventario = require('./MovimientoInventario');
const Notificacion = require('./Notificacion');
const AuditLog = require('./AuditLog');
const ConfiguracionSistema = require('./ConfiguracionSistema');

// --- Relaciones ---

// Usuario <-> Sede
Usuario.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Sede.hasMany(Usuario, { foreignKey: 'sedeId', as: 'usuarios' });

// Producto <-> Categoria
Producto.belongsTo(Categoria, { foreignKey: 'categoriaId', as: 'categoria' });
Categoria.hasMany(Producto, { foreignKey: 'categoriaId', as: 'productos' });

// StockSede <-> Producto, Sede
StockSede.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });
StockSede.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Producto.hasMany(StockSede, { foreignKey: 'productoId', as: 'stocks' });
Sede.hasMany(StockSede, { foreignKey: 'sedeId', as: 'stocks' });

// NumeroSerie <-> Producto, Sede, Cliente
NumeroSerie.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });
NumeroSerie.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
NumeroSerie.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
Producto.hasMany(NumeroSerie, { foreignKey: 'productoId', as: 'numerosSerie' });
Sede.hasMany(NumeroSerie, { foreignKey: 'sedeId', as: 'numerosSerie' });
Cliente.hasMany(NumeroSerie, { foreignKey: 'clienteId', as: 'numerosSerie' });

// Cliente <-> Sede
Cliente.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Sede.hasMany(Cliente, { foreignKey: 'sedeId', as: 'clientes' });

// Venta <-> Cliente, Usuario, Sede
Venta.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
Venta.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Venta.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Cliente.hasMany(Venta, { foreignKey: 'clienteId', as: 'ventas' });
Usuario.hasMany(Venta, { foreignKey: 'usuarioId', as: 'ventas' });
Sede.hasMany(Venta, { foreignKey: 'sedeId', as: 'ventas' });

// ItemVenta <-> Venta, Producto
ItemVenta.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
ItemVenta.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });
Venta.hasMany(ItemVenta, { foreignKey: 'ventaId', as: 'items' });
Producto.hasMany(ItemVenta, { foreignKey: 'productoId', as: 'itemsVenta' });

// PagoVenta <-> Venta
PagoVenta.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
Venta.hasMany(PagoVenta, { foreignKey: 'ventaId', as: 'pagos' });

// Cotizacion <-> Cliente, Usuario, Sede, Venta, OrdenReparacion
Cotizacion.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
Cotizacion.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Cotizacion.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Cotizacion.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
Cotizacion.belongsTo(OrdenReparacion, { foreignKey: 'ordenReparacionId', as: 'ordenReparacion' });
Cliente.hasMany(Cotizacion, { foreignKey: 'clienteId', as: 'cotizaciones' });
Usuario.hasMany(Cotizacion, { foreignKey: 'usuarioId', as: 'cotizaciones' });
Sede.hasMany(Cotizacion, { foreignKey: 'sedeId', as: 'cotizaciones' });
Venta.hasOne(Cotizacion, { foreignKey: 'ventaId', as: 'cotizacion' });
OrdenReparacion.hasOne(Cotizacion, { foreignKey: 'ordenReparacionId', as: 'cotizacion' });

// ItemCotizacion <-> Cotizacion, Producto
ItemCotizacion.belongsTo(Cotizacion, { foreignKey: 'cotizacionId', as: 'cotizacion' });
ItemCotizacion.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });
Cotizacion.hasMany(ItemCotizacion, { foreignKey: 'cotizacionId', as: 'items' });
Producto.hasMany(ItemCotizacion, { foreignKey: 'productoId', as: 'itemsCotizacion' });

// OrdenReparacion <-> Cliente, Usuario (Tecnico), Sede
OrdenReparacion.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
OrdenReparacion.belongsTo(Usuario, { foreignKey: 'tecnicoId', as: 'tecnico' });
OrdenReparacion.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Cliente.hasMany(OrdenReparacion, { foreignKey: 'clienteId', as: 'ordenesReparacion' });
Usuario.hasMany(OrdenReparacion, { foreignKey: 'tecnicoId', as: 'ordenesAsignadas' });
Sede.hasMany(OrdenReparacion, { foreignKey: 'sedeId', as: 'ordenesReparacion' });

// FotoReparacion <-> OrdenReparacion
FotoReparacion.belongsTo(OrdenReparacion, { foreignKey: 'ordenId', as: 'orden' });
OrdenReparacion.hasMany(FotoReparacion, { foreignKey: 'ordenId', as: 'fotos' });

// RepuestoOrden <-> OrdenReparacion, Producto
RepuestoOrden.belongsTo(OrdenReparacion, { foreignKey: 'ordenId', as: 'orden' });
RepuestoOrden.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });
OrdenReparacion.hasMany(RepuestoOrden, { foreignKey: 'ordenId', as: 'repuestos' });
Producto.hasMany(RepuestoOrden, { foreignKey: 'productoId', as: 'repuestosEnOrdenes' });

// RentabilidadReparacion <-> OrdenReparacion
RentabilidadReparacion.belongsTo(OrdenReparacion, { foreignKey: 'ordenId', as: 'orden' });
OrdenReparacion.hasOne(RentabilidadReparacion, { foreignKey: 'ordenId', as: 'rentabilidad' });

// TradeIn <-> Cliente, Sede, Usuario, Venta, Producto
TradeIn.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
TradeIn.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
TradeIn.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
TradeIn.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
TradeIn.belongsTo(Producto, { foreignKey: 'productoInventarioId', as: 'productoInventario' });
Cliente.hasMany(TradeIn, { foreignKey: 'clienteId', as: 'tradeIns' });
Sede.hasMany(TradeIn, { foreignKey: 'sedeId', as: 'tradeIns' });
Usuario.hasMany(TradeIn, { foreignKey: 'usuarioId', as: 'tradeIns' });
Venta.hasMany(TradeIn, { foreignKey: 'ventaId', as: 'tradeIns' });

// EgresoCaja <-> Caja, Usuario, CategoriaEgreso, Usuario (Autorizador)
EgresoCaja.belongsTo(Caja, { foreignKey: 'cajaId', as: 'caja' });
EgresoCaja.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
EgresoCaja.belongsTo(CategoriaEgreso, { foreignKey: 'categoriaId', as: 'categoria' });
EgresoCaja.belongsTo(Usuario, { foreignKey: 'autorizadoPor', as: 'autorizador' });
Caja.hasMany(EgresoCaja, { foreignKey: 'cajaId', as: 'egresos' });
CategoriaEgreso.hasMany(EgresoCaja, { foreignKey: 'categoriaId', as: 'egresos' });

// Caja <-> Sede, Usuario (Apertura), Usuario (Cierre)
Caja.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Caja.belongsTo(Usuario, { foreignKey: 'usuarioAperturaId', as: 'usuarioApertura' });
Caja.belongsTo(Usuario, { foreignKey: 'usuarioCierreId', as: 'usuarioCierre' });
Sede.hasMany(Caja, { foreignKey: 'sedeId', as: 'cajas' });

// Factura <-> Venta, OrdenReparacion, Cliente, Sede
Factura.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
Factura.belongsTo(OrdenReparacion, { foreignKey: 'ordenReparacionId', as: 'ordenReparacion' });
Factura.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
Factura.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Venta.hasOne(Factura, { foreignKey: 'ventaId', as: 'factura' });
OrdenReparacion.hasOne(Factura, { foreignKey: 'ordenReparacionId', as: 'factura' });
Cliente.hasMany(Factura, { foreignKey: 'clienteId', as: 'facturas' });
Sede.hasMany(Factura, { foreignKey: 'sedeId', as: 'facturas' });

// CuentaPorCobrar <-> Factura, Cliente
CuentaPorCobrar.belongsTo(Factura, { foreignKey: 'facturaId', as: 'factura' });
CuentaPorCobrar.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
Factura.hasOne(CuentaPorCobrar, { foreignKey: 'facturaId', as: 'cuentaPorCobrar' });
Cliente.hasMany(CuentaPorCobrar, { foreignKey: 'clienteId', as: 'cuentasPorCobrar' });

// Abono <-> CuentaPorCobrar, Usuario
Abono.belongsTo(CuentaPorCobrar, { foreignKey: 'cuentaPorCobrarId', as: 'cuentaPorCobrar' });
Abono.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
CuentaPorCobrar.hasMany(Abono, { foreignKey: 'cuentaPorCobrarId', as: 'abonos' });

// Empleado <-> Usuario, Sede
Empleado.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Empleado.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Sede.hasMany(Empleado, { foreignKey: 'sedeId', as: 'empleados' });

// Nomina <-> Empleado
Nomina.belongsTo(Empleado, { foreignKey: 'empleadoId', as: 'empleado' });
Empleado.hasMany(Nomina, { foreignKey: 'empleadoId', as: 'nominas' });

// OrdenCompra <-> Proveedor, Usuario, Sede
OrdenCompra.belongsTo(Proveedor, { foreignKey: 'proveedorId', as: 'proveedor' });
OrdenCompra.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
OrdenCompra.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
Proveedor.hasMany(OrdenCompra, { foreignKey: 'proveedorId', as: 'ordenesCompra' });
Usuario.hasMany(OrdenCompra, { foreignKey: 'usuarioId', as: 'ordenesCompra' });
Sede.hasMany(OrdenCompra, { foreignKey: 'sedeId', as: 'ordenesCompra' });

// ItemOrdenCompra <-> OrdenCompra, Producto
ItemOrdenCompra.belongsTo(OrdenCompra, { foreignKey: 'ordenCompraId', as: 'ordenCompra' });
ItemOrdenCompra.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });
OrdenCompra.hasMany(ItemOrdenCompra, { foreignKey: 'ordenCompraId', as: 'items' });
Producto.hasMany(ItemOrdenCompra, { foreignKey: 'productoId', as: 'compras' });

// PagoCompra <-> OrdenCompra, Usuario; EgresoCaja opcional vía pagoCompraId
PagoCompra.belongsTo(OrdenCompra, { foreignKey: 'ordenCompraId', as: 'ordenCompra' });
PagoCompra.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
OrdenCompra.hasMany(PagoCompra, { foreignKey: 'ordenCompraId', as: 'pagos' });
EgresoCaja.belongsTo(PagoCompra, { foreignKey: 'pagoCompraId', as: 'pagoCompra' });
PagoCompra.hasOne(EgresoCaja, { foreignKey: 'pagoCompraId', as: 'egresoCaja' });

// MovimientoInventario <-> Producto, Sede, Usuario
MovimientoInventario.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });
MovimientoInventario.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });
MovimientoInventario.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Producto.hasMany(MovimientoInventario, { foreignKey: 'productoId', as: 'movimientos' });
Sede.hasMany(MovimientoInventario, { foreignKey: 'sedeId', as: 'movimientos' });

// Notificacion <-> OrdenReparacion, Cliente
Notificacion.belongsTo(OrdenReparacion, { foreignKey: 'ordenReparacionId', as: 'orden' });
Notificacion.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
OrdenReparacion.hasMany(Notificacion, { foreignKey: 'ordenReparacionId', as: 'notificaciones' });
Cliente.hasMany(Notificacion, { foreignKey: 'clienteId', as: 'notificaciones' });

// AuditLog <-> Usuario, Sede
AuditLog.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
AuditLog.belongsTo(Sede, { foreignKey: 'sedeId', as: 'sede' });

module.exports = {
  sequelize,
  Sequelize,
  Sede,
  Usuario,
  Categoria,
  Producto,
  StockSede,
  NumeroSerie,
  Cliente,
  Venta,
  ItemVenta,
  PagoVenta,
  Cotizacion,
  ItemCotizacion,
  OrdenReparacion,
  FotoReparacion,
  RepuestoOrden,
  RentabilidadReparacion,
  TradeIn,
  CategoriaEgreso,
  EgresoCaja,
  Caja,
  Factura,
  CuentaPorCobrar,
  Abono,
  Empleado,
  Nomina,
  Proveedor,
  OrdenCompra,
  ItemOrdenCompra,
  PagoCompra,
  MovimientoInventario,
  Notificacion,
  AuditLog,
  ConfiguracionSistema
};
