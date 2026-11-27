import type { ShopeePickupChoice } from "@sellbridge/marketplaces";
import { formatShortDate } from "@/lib/relative-time";
import { escapeHtml } from "./print-shipment";
import { pickupAddressLines } from "./shopee-pickup";

/** Form fields the confirmation sends back with the label request it confirms. */
export const PICKUP_ADDRESS_FIELD = "coleta";
export const PICKUP_TIME_FIELD = "horario";

/**
 * Pages of the label tab (they open from the label button, in a new tab), in the app's font and
 * colors and in both themes, like the label error page. Phone first: one column, 48 px buttons.
 */
const STYLE = `
:root{color-scheme:light dark;--muted:light-dark(#5b6068,#a3a7ad);--box:light-dark(#ffffff,#18181b);--line:light-dark(#e3e5e8,#2c2c31);--action:light-dark(#0f5132,#7ee2a8);--on-action:light-dark(#ffffff,#0b2a1b)}
*{box-sizing:border-box}
body{font:16px/1.5 "Manrope",system-ui,sans-serif;margin:0;padding:24px 16px;background:light-dark(#f4f5f6,#0e0e10);color:light-dark(#111111,#f5f5f5)}
main{max-width:480px;margin:0 auto;display:grid;gap:16px}
.context{margin:0;color:var(--muted);font-size:14px}
h1{margin:0;font-size:22px;line-height:1.3}
p{margin:0}
.box{background:var(--box);border:1px solid var(--line);border-radius:12px;padding:16px;display:grid;gap:4px}
.label{color:var(--muted);font-size:14px}
.address{font-size:18px;font-weight:600}
.when{margin-top:8px}
button{font:inherit;font-weight:700;min-height:48px;width:100%;border:0;border-radius:10px;padding:12px 16px;background:var(--action);color:var(--on-action);cursor:pointer}
button:disabled{opacity:.7;cursor:progress}
button:focus-visible{outline:3px solid light-dark(#111111,#f5f5f5);outline-offset:2px}
.note{color:var(--muted);font-size:14px}
.lines{display:grid;gap:4px}
`;

function page(title: string, body: string, script = ""): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main>${script === "" ? "" : `<script>${script}</script>`}</body></html>`;
}

function lines(values: readonly string[], className: string): string {
  return values.map((line) => `<span class="${className}">${escapeHtml(line)}</span>`).join("");
}

function hiddenFields(form: URLSearchParams): string {
  return [...form.entries()]
    .filter(([name]) => name !== PICKUP_ADDRESS_FIELD && name !== PICKUP_TIME_FIELD)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");
}

function pickupWhen(choice: ShopeePickupChoice): string {
  const parts = [
    choice.pickupDate === undefined ? "" : formatShortDate(choice.pickupDate),
    choice.timeText ?? "",
  ].filter((part) => part !== "");
  return parts.length === 0
    ? ""
    : `<span class="when">Coleta prevista: <strong>${escapeHtml(parts.join(" · "))}</strong></span>`;
}

// One click only: the button says what is happening and a second click sends nothing.
const SUBMIT_ONCE = `document.querySelector("form").addEventListener("submit",function(event){var button=event.target.querySelector("button");if(button.disabled){event.preventDefault();return;}button.disabled=true;button.textContent="Agendando a coleta...";});`;

export interface PickupConfirmation {
  /** The marketplace's order number, as the person sees it on Shopee. */
  readonly externalOrderId: string;
  readonly shopName: string;
  readonly choice: ShopeePickupChoice;
  /** The label request being confirmed: its form fields and the URL it was posted to. */
  readonly form: URLSearchParams;
  readonly action: string;
}

/** Shows where the carrier will pick the parcel up, before Shopee schedules it. */
export function pickupConfirmationPage(confirmation: PickupConfirmation): string {
  const { choice } = confirmation;
  return page(
    "Confirme a coleta",
    `<p class="context">Pedido ${escapeHtml(confirmation.externalOrderId)} · Shopee · ${escapeHtml(confirmation.shopName)}</p>
<h1>Confirme onde a transportadora vai buscar o pacote</h1>
<div class="box"><span class="label">A coleta será em:</span>${lines(pickupAddressLines(choice), "address")}${pickupWhen(choice)}</div>
<form method="post" action="${escapeHtml(confirmation.action)}">${hiddenFields(confirmation.form)}<input type="hidden" name="${PICKUP_ADDRESS_FIELD}" value="${choice.addressId}"><input type="hidden" name="${PICKUP_TIME_FIELD}" value="${escapeHtml(choice.pickupTimeId ?? "")}"><button type="submit">Confirmar coleta e gerar etiqueta</button></form>
<p class="note">Ao confirmar, a Shopee agenda a coleta neste endereço e a etiqueta abre logo em seguida.</p>
<p class="note">Endereço errado? Corrija o endereço de coleta da loja ${escapeHtml(confirmation.shopName)} na Shopee e peça a etiqueta de novo.</p>`,
    SUBMIT_ONCE,
  );
}

const COPY_ADDRESS = `document.querySelector("button").addEventListener("click",function(event){var button=event.currentTarget;var text=document.querySelector("[data-address]").innerText;navigator.clipboard.writeText(text).then(function(){button.textContent="Endereço copiado";},function(){button.textContent="Não deu para copiar. Selecione o endereço e copie.";});});`;

export interface PickupMissing {
  readonly externalOrderId: string;
  readonly shopName: string;
  readonly supplierAddress: readonly string[];
  /** Several of the shop's pickup addresses are the supplier's, instead of none. */
  readonly ambiguous: boolean;
}

/** Says what the reseller must register on Shopee before the pickup can be scheduled. */
export function pickupMissingPage(missing: PickupMissing): string {
  const reason = missing.ambiguous
    ? `A loja ${missing.shopName} tem mais de um endereço de coleta igual ao do fornecedor na Shopee. Deixe só um e peça a etiqueta de novo.`
    : `A transportadora busca o pacote no endereço do fornecedor, mas a loja ${missing.shopName} ainda não tem esse endereço como endereço de coleta na Shopee.`;
  return page(
    "Falta o endereço de coleta",
    `<p class="context">Pedido ${escapeHtml(missing.externalOrderId)} · Shopee · ${escapeHtml(missing.shopName)}</p>
<h1>${missing.ambiguous ? "Endereço de coleta repetido na Shopee" : "Falta o endereço de coleta na Shopee"}</h1>
<p>${escapeHtml(reason)}</p>
<div class="box"><span class="label">Endereço que a loja precisa ter na Shopee:</span><div data-address class="lines">${lines(missing.supplierAddress, "address")}</div></div>
<button type="button">Copiar endereço</button>
<p class="note">Na Central do Vendedor da Shopee, cadastre este endereço nos endereços da loja e marque como endereço de coleta. Depois, peça a etiqueta de novo. Nenhuma coleta foi agendada.</p>`,
    COPY_ADDRESS,
  );
}
