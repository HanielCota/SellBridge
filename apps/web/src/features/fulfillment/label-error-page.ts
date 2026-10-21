import { escapeHtml } from "./print-shipment";

/**
 * The page a refused label opens in its new tab: the reason in the app's font and colors, in
 * both themes, instead of the browser's plain-text view (white page, default font).
 */
export function labelErrorPage(message: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Etiqueta</title><style>body{font:16px/1.5 "Manrope",system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;padding:0 16px;text-align:center;background:light-dark(#f4f5f6,#0e0e10);color:light-dark(#111111,#f5f5f5)}</style></head><body><p>${escapeHtml(message)}</p></body></html>`;
}
