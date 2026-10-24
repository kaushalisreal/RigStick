import {messageError} from './localized-error.mjs';
/** A lost 2D context may accept no-op draws; never encode those as valid frames. */
const lostCanvases = new WeakSet(), watched = new WeakSet();
export function checkExportContext(context) {
  if (!context || lostCanvases.has(context.canvas) || context.isContextLost?.()) {
    const error = messageError(new Error(''), "errors.exportCanvas.theExportCanvasBecameUnavailableExportStoppedBefore", {});
    error.code = 'export_canvas_lost'; throw error;
  }
  return context;
}
// Export canvases are CPU-backed unless the export rendering preference chose the GPU (setExportDevice, per realm).
let gpuCanvases = false;
/** 'gpu' lets the browser draw export frames on the graphics card; anything else keeps them CPU-backed. */
export function setExportDevice(device) { gpuCanvases = device === 'gpu'; }
export const exportDevice = () => (gpuCanvases ? 'gpu' : 'cpu');
export function exportContext(canvas) {
  if (!watched.has(canvas)) {
    watched.add(canvas);
    canvas.addEventListener?.('contextlost', () => lostCanvases.add(canvas));
  }
  return checkExportContext(canvas.getContext('2d', gpuCanvases ? {} : {willReadFrequently: true}));
}
