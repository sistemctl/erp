import type { ProductoDTO, StockDTO, CategoriaDTO } from '../../../../shared/contracts.js';
export interface ComboEditor {productoId: string; cantidad: number; producto?: Partial<ProductoDTO>; disponible?: number; precioCosto?: string; nombre?: string; codigoBarras?: string; tieneNumeroSerie?: boolean;}
export type ProductoInventario = ProductoDTO & {componentes?: ComboEditor[]};
export type StockInventario = Omit<StockDTO,'producto'> & {producto: ProductoInventario};
export type CategoriaInventario = CategoriaDTO & {productCount?: number};
export interface SerieInventario {id: string; serie: string; estado: string; sedeId: string; sede?: {nombre: string} | null;}
