import type { ConfiguracionSistemaColumns, SedeColumns, UsuarioColumns, NotificacionColumns } from './model-columns.js';
import type { ThemeOverride } from '../utils/theme.js';
import type { MedioPago } from './finance.js';
export type ConfigSistema = Omit<ConfiguracionSistemaColumns, 'mediosPago' | 'temaInterfaz'> & {
  mediosPago: MedioPago[]; temaInterfaz: ThemeOverride | null;
  servidor?: { puertoActivo?: number; puertoConfigurado?: number; urlLocal?: string; urlPublica?: string | null; urlActiva?: string; requiereReinicio?: boolean };
  requiereReinicio?: boolean; mensajeReinicio?: string;
};
export type SedeConfig = SedeColumns;
export type UsuarioConfig = UsuarioColumns & { sede?: SedeColumns | null };
export interface UsuarioEditor { id: string; nombre: string; email: string; rol: string; sedeId: string | null; activo: boolean; }
export type NotificacionConfig = NotificacionColumns & {
  factura?: { numeroFactura: string } | null; orden?: { numeroOrden: string } | null;
  cliente?: { nombre: string; email: string | null; telefono: string | null } | null;
};

