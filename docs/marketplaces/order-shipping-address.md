# Order shipping address

Goal: when a product sells on a marketplace (Shopee, TikTok Shop, Mercado Livre), the reseller's
"Operar pedido" form opens with the buyer's address already filled. This page lists what is ready
and where the real marketplace connection plugs in.

## Contract (`packages/marketplaces/src/shipping-address.ts`)

- `marketplaceShippingAddressSchema` / `MarketplaceShippingAddress`: `recipient`, `street`,
  `number`, `complement`, `neighborhood` (district, "bairro"), `city`, `state` (UF, two letters),
  `postalCode` (CEP, `00000-000` or `00000000`). Same keys as the forward form's address.
  It is lenient on purpose (no contact-detail check): the forward schema
  (`deliveryAddressSchema`) checks again when the reseller sends the order to the supplier.
- `shippingAddressReading(candidate)`: validates a raw address and answers
  `{ kind: "available", address }` or `{ kind: "unavailable", reason: "not_provided" }`.
  Use it on every marketplace response; a malformed address is never an error.

Two ways for a connector to deliver the address:

1. **With the order** (preferred when the order payload has it, e.g. Shopee's order detail):
   fill `MarketplaceOrder.shippingAddress` in `fetchOrder` / `listOrders`, after
   `shippingAddressReading`. Nothing else to do: the worker stores it.
2. **With its own call** (optional capability):
   `connector.readShippingAddress?(credentials, externalOrderId)`. Mercado Livre implements it with the shipment calls it already
   makes (`readMercadoLivreShippingAddress` in `mercado-livre/shipping.ts`). Shopee and TikTok Shop
   (`unavailable-connector.ts`) answer `not_supported`; the mock sends it with the order instead.

## Where to plug the connector call

- Ingestion: `apps/worker/src/processors/webhook-event.ts`, `syncOrder` → `incomingOrder` seals
  `order.shippingAddress` and `upsertMarketplaceOrder` stores it. A later delivery without an
  address keeps the stored one.
- For a marketplace on option 2, call `connector.readShippingAddress` in `syncOrder` after
  `fetchOrder` (only for paid orders, to avoid an extra call per status change) and put the
  `available` address on the order before `incomingOrder`. Not wired today, so no new network calls
  happen on order sync.
- The auto-forward job (`order-auto-forward.ts`) still reads the Mercado Livre address live; it can
  read the stored one first once other marketplaces deliver it.

## What is stored

- `orders.shipping_address_enc` (migration `0048_order_shipping_address.sql`): the address as JSON,
  encrypted with `TOKEN_ENCRYPTION_KEY` (AES-256-GCM, `sealShippingAddress` /
  `openShippingAddress`).
- The web app opens it only in `loadFulfillmentDetail`
  (`apps/web/src/features/fulfillment/fulfillment-detail.server.ts`), and only while the order is
  paid and not yet forwarded. The browser receives the opened address, never the ciphertext.
- Simulated sales (`SIM-…`, `mock-sale.server.ts`) carry a made-up São Paulo address so the filled
  form can be seen locally.

## Privacy

- The address is never logged: log events carry only ids and a reason
  (`order.shipping_address_unreadable`, `order.shipping_address_decrypt_failed`).
- It is not part of the account export, the public API, outgoing webhooks or reports.
- The supplier receives exactly what the reseller confirms in the forward form, as before
  (`order_shipments.address`); nothing more of the buyer or the reseller.
- A rotated `TOKEN_ENCRYPTION_KEY` makes old addresses unreadable: the form falls back to empty
  fields plus the label reader, which is acceptable for a pending order.
