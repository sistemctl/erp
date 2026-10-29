export type ModuleInit = (container: HTMLElement, rawHash: string) => void | Promise<void>;
export interface ModuleLifecycle { init: ModuleInit; destroy?: () => void; }
type FunctionKey<T, F> = { [K in keyof T]: T[K] extends F ? K : never }[keyof T] & string;
export interface ModuleLoader { load(): Promise<ModuleLifecycle>; }
export const ASSET_V = '3.0.114';

/** Los nombres y firmas se comprueban contra los exports del archivo fuente. */
export function defineModule<T>(path: string, init: FunctionKey<T, ModuleInit>, destroy?: FunctionKey<T, () => void>): ModuleLoader {
  return {
    async load() {
      const namespace: unknown = await import(`${path}?v=${ASSET_V}`);
      return validateModule(namespace, init, destroy);
    }
  };
}

export function validateModule(namespace: unknown, entry: string, cleanup?: string): ModuleLifecycle {
  if (typeof namespace !== 'object' || namespace === null) throw new Error('El módulo no contiene exports válidos.');
  const exports = namespace as Record<string, unknown>;
  const init = exports[entry];
  const destroy = cleanup ? exports[cleanup] : undefined;
  if (typeof init !== 'function') throw new Error(`El módulo no exporta la función ${entry}.`);
  if (cleanup && typeof destroy !== 'function') throw new Error(`El módulo no exporta la función ${cleanup}.`);
  // Frontera de importación dinámica: la firma se verifica estáticamente en defineModule.
  return { init: init as ModuleInit, ...(cleanup ? { destroy: destroy as () => void } : {}) };
}

export const moduleRegistry = {
  '#/dashboard': defineModule<typeof import('../modules/dashboard.js')>('../modules/dashboard.js', 'initDashboard'),
  '#/pos': defineModule<typeof import('../modules/pos.js')>('../modules/pos.js', 'initPos', 'destroyPos'),
  '#/inventario': defineModule<typeof import('../modules/inventario.js')>('../modules/inventario.js', 'initInventario', 'destroyInventario'),
  '#/series': defineModule<typeof import('../modules/series.js')>('../modules/series.js', 'initSeries'),
  '#/reparaciones': defineModule<typeof import('../modules/reparaciones.js')>('../modules/reparaciones.js', 'initReparaciones'),
  '#/instalaciones': defineModule<typeof import('../modules/instalaciones.js')>('../modules/instalaciones.js', 'initInstalaciones', 'destroyInstalaciones'),
  '#/rentabilidad': defineModule<typeof import('../modules/rentabilidad.js')>('../modules/rentabilidad.js', 'initRentabilidad'),
  '#/reportes': defineModule<typeof import('../modules/reportes.js')>('../modules/reportes.js', 'initReportes'),
  '#/facturacion': defineModule<typeof import('../modules/facturacion.js')>('../modules/facturacion.js', 'initFacturacion'),
  '#/ventas': defineModule<typeof import('../modules/ventas.js')>('../modules/ventas.js', 'initVentas'),
  '#/clientes': defineModule<typeof import('../modules/clientes.js')>('../modules/clientes.js', 'initClientes'),
  '#/nomina': defineModule<typeof import('../modules/nomina.js')>('../modules/nomina.js', 'initNomina'),
  '#/compras': defineModule<typeof import('../modules/compras.js')>('../modules/compras.js', 'initCompras', 'destroyCompras'),
  '#/proveedores': defineModule<typeof import('../modules/proveedores.js')>('../modules/proveedores.js', 'initProveedores'),
  '#/caja': defineModule<typeof import('../modules/caja.js')>('../modules/caja.js', 'initCaja'),
  '#/cotizaciones': defineModule<typeof import('../modules/cotizaciones.js')>('../modules/cotizaciones.js', 'initCotizaciones'),
  '#/tradein': defineModule<typeof import('../modules/tradein.js')>('../modules/tradein.js', 'initTradeIn'),
  '#/rma': defineModule<typeof import('../modules/rma.js')>('../modules/rma.js', 'initRma'),
  '#/cartera': defineModule<typeof import('../modules/cartera.js')>('../modules/cartera.js', 'initCartera'),
  '#/config': defineModule<typeof import('../modules/config.js')>('../modules/config.js', 'initConfig')
} satisfies Record<string, ModuleLoader>;
export const seguimientoModule = defineModule<typeof import('../modules/seguimiento-reparacion.js')>('../modules/seguimiento-reparacion.js', 'initSeguimientoReparacion');
export type ModuleRoute = keyof typeof moduleRegistry;
export function isModuleRoute(route: string): route is ModuleRoute { return Object.hasOwn(moduleRegistry, route); }
