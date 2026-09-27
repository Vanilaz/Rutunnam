// Ambient types for browser globals that come from CDN scripts rather than npm imports.
import "leaflet";

declare module "leaflet" {
  /** Layer from @maplibre/maplibre-gl-leaflet, loaded on demand from unpkg. */
  export interface MaplibreGLLayer extends Layer {
    getMaplibreMap(): { once(event: string, fn: () => void): void; on(event: string, fn: () => void): void } | undefined;
    getContainer(): HTMLElement | undefined;
  }
  export function maplibreGL(options: { style: string; attributionControl?: { customAttribution: string } }): MaplibreGLLayer;
}

declare global {
  interface Window { maplibregl?: unknown }
}

export {};
