const { controller } = require('./ts-backend-tools.cjs');
controller('compras', `import type { Attributes, WhereOptions } from 'sequelize';
import type CompraModel = require('../models/OrdenCompra');
import type PagoModel = require('../models/PagoCompra');
interface CompraItem { productoId: string; cantidadPedida?: number | string; precioUnitario?: number | string; cantidadRecibida?: number | string; cantidadDevolver?: number | string; series?: string[]; }
interface Body { proveedorId?: string; sedeId?: string; fechaEsperada?: string; observaciones?: string; items?: CompraItem[]; monto?: number | string; fuenteFondos?: Attributes<PagoModel>['fuenteFondos']; pagadoPor?: string; referencia?: string; }`, [
  ['const where = {};', 'const where: WhereOptions<Attributes<CompraModel>> = {};'],
  ['where.estado = estado;', "where.estado = estado as Attributes<CompraModel>['estado'];"],
  ['where.estadoPago = estadoPago;', "where.estadoPago = estadoPago as Attributes<CompraModel>['estadoPago'];"],
  ['    let todasCompletas = true;', "    if (!orden.items) throw new Error('La orden no conserva sus artículos.');\n    let todasCompletas = true;"],
  ['    for (const devItem of items) {', "    if (!orden.items) throw new Error('La orden no conserva sus artículos.');\n    for (const devItem of items) {"],
  ["estado: 'en_stock'\n        }))", "estado: 'en_stock' as const\n        }))"],
  ["let nuevoEstado = 'pendiente';", "let nuevoEstado: Attributes<CompraModel>['estado'] = 'pendiente';"]
]);
