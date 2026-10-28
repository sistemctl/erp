/** Persisted JSON shapes; incoming request values are still validated at runtime. */
export interface PagoCaja { metodo: string; monto: number; }
export interface MedioPago { id: string; nombre: string; activo: boolean; recaudoDiferido?: boolean; plazoDias?: number | string; }
