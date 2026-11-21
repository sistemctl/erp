import type { ClienteDTO, ProductoDTO, SedeDTO } from '../../../../shared/contracts';
export interface SerieDTO {
  id: string; serie: string; estado: 'en_stock' | 'vendido' | 'en_reparacion' | 'reacondicionado';
  productoId: string; sedeId: string; producto: ProductoDTO; sede: SedeDTO;
  cliente: ClienteDTO | null; fechaVenta: string | null;
}
export interface SerieHistorial {
  info: SerieDTO;
  reparaciones: { numeroOrden: string; createdAt: string; estado: string; diagnostico: string | null }[];
}
