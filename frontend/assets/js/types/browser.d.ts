import type { DataChangeDetail, QuickActionDetail } from '../../../../shared/contracts';
interface ToggleInstance { show(): void; hide(): void; toggle(): void; dispose(): void; }
interface BootstrapComponent<T = ToggleInstance> {
  new(element: Element | string, options?: Record<string, unknown>): T;
  getInstance(element: Element | string): T | null;
  getOrCreateInstance(element: Element | string, options?: Record<string, unknown>): T;
}
interface BootstrapAPI { Modal: BootstrapComponent; Collapse: BootstrapComponent; Dropdown: BootstrapComponent; Tooltip: BootstrapComponent; Tab: BootstrapComponent<Pick<ToggleInstance, 'show' | 'dispose'>>; }
interface BarcodeOptions { format?: string; width?: number; height?: number; displayValue?: boolean; margin?: number; fontSize?: number; background?: string; lineColor?: string; }
type BarcodeAPI = (element: Element | string, value: string, options?: BarcodeOptions) => void;
interface ChartInstance { destroy(): void; update(mode?: string): void; }
interface ChartAPI { new(context: HTMLCanvasElement | CanvasRenderingContext2D, configuration: Record<string, unknown>): ChartInstance; }
declare global {
  const bootstrap: BootstrapAPI;
  const Chart: ChartAPI;
  const JsBarcode: BarcodeAPI;
  interface Window {
    bootstrap: BootstrapAPI; Chart: ChartAPI; JsBarcode?: BarcodeAPI;
    activeModuleCleanup?: (() => void) | null;
    pendingCotizacionAprobacionId?: string | null;
  }
  interface WindowEventMap {
    'erp:data-changed': CustomEvent<DataChangeDetail>;
    'erp:quick-action': CustomEvent<QuickActionDetail>;
  }
}
