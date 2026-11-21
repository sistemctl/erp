export interface PagoDashboard { proveedor: string; monto: number; fecha: string; ordenRef: string; fuenteFondos: string; fuenteLabel: string; pagadoPor: string | null; referencia: string | null; }
export interface KpisDashboard {
  ventasTotal: number; unidadesVendidas: number; reparacionesActivas: number; tiempoPromedio: number;
  dineroEnCaja: number; stockBajoCount: number; totalCartera: number; totalCarteraVencida: number;
  clientesNuevos: number; totalGastos: number; totalGastosOperativos: number; totalComprasPagadas: number;
  totalGastoEmpresa: number; pagosComprasDetalle: PagoDashboard[]; totalCompras: number; totalOrdenesCompra: number;
  totalEgresos: number; cuentasPorPagar: number; resultadoNeto: number;
}
export interface GraficaFila { fecha: string; ventas?: number; total?: number; gastoTotal?: number; egresos?: number; }
export type GraficaDashboard = GraficaFila[] | { data: GraficaFila[]; bucket: string };
export interface GastoDashboard { totalGeneral: number; porCategoria: { nombre: string; total: number; cantidad: number }[]; detalle: { fecha: string; categoria: string; motivo: string; usuario: string; monto: number }[]; }
export interface ActividadDashboard {
  alertas: { tipo: string; detalleTipo: string; clave: string; label: string }[];
  eventos: { monto: number | '' | null; cuando: string; href: string; clave: string; titulo: string; detalle: string }[];
}
export interface DetalleFila { monto?: number | null; montoEsCantidad?: boolean; montoSufijo?: string; primaria?: string; secundaria?: string; }
export interface DetalleDashboard { titulo: string; valorLabel: string; valor: number | null; filas: DetalleFila[]; vacio: string; linkLabel: string; scrollTarget?: string; link: string; }
export interface RankingDashboard { nombre: string; total: number; }

