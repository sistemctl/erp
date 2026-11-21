import type { DataChangeDetail, ProductoDTO, QuickActionDetail, VentaCreada, VentaDTO } from '../../../../shared/contracts';
import type { apiGet } from '../api.js';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
/** Regresiones de tipos: fallan al compilar si desaparecen los contratos reales. */
export type ContractChecks = [
  Expect<Equal<ProductoDTO['precioVenta'], string>>,
  Expect<Equal<VentaDTO['total'], string>>,
  Expect<Equal<VentaCreada['total'], number>>,
  Expect<Equal<WindowEventMap['erp:data-changed']['detail'], DataChangeDetail>>,
  Expect<Equal<WindowEventMap['erp:quick-action']['detail'], QuickActionDetail>>,
  Expect<Equal<Awaited<ReturnType<typeof apiGet<'/productos'>>>, ProductoDTO[] | null>>
];
