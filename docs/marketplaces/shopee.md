# Shopee Open Platform setup

The Shopee connector supports Brazilian shops. It authorizes shops, renews access, publishes
listings, synchronizes stock and price, imports orders, and requests the Shopee shipping label in PDF.

## Configure a sandbox shop

1. In the [Shopee Open Platform Console](https://open.shopee.com/), create an **ERP System** app.
   Under **Test Account (Sandbox v2)**, create a Brazilian shop account.
2. Set `SHOPEE_PARTNER_ID` and `SHOPEE_PARTNER_KEY` to the app's sandbox credentials and set
   `SHOPEE_SANDBOX=true` in both the web app and worker. Restart both services after saving the
   configuration. For local development, set these values in the root `.env`.
3. Set `APP_URL` to the address where the reseller signs in to SellBridge. In the Shopee Console,
   set the **Test Redirect URL Domain** to the hostname from `APP_URL`. SellBridge sends
   `{APP_URL}/api/oauth/shopee/callback` as the redirect URI.
4. In SellBridge, open **Lojas** and choose **Conectar Shopee**. Sign in with the sandbox shop
   account and grant access. Confirm that SellBridge returns to **Lojas** and shows the shop name.
5. In the sandbox, verify that the worker renews the access before it expires. Revoke the shop's
   authorization in Seller Center and verify that the shop can be reconnected.
6. In **Push Mechanism**, set the callback to `{APP_URL}/api/webhooks/shopee` and enable
   **Order Status Update Push** (code 3). Use the same scheme, hostname and path, with no trailing
   slash. The signed callback URI must match exactly. Create a sandbox order for a published
   listing and verify its status, stock reservation, and PDF label in SellBridge.

## Configure production

Complete **Go Live** in the Shopee Console and use the live partner ID and key in both services.
Set `SHOPEE_SANDBOX=false`. For `APP_URL=https://app.sellbridge.com.br`, use
`app.sellbridge.com.br` as the **Live Redirect URL Domain** and
`https://app.sellbridge.com.br/api/oauth/shopee/callback` as the callback URI. Use a Brazilian
seller account to connect the shop. If the app enforces an IP whitelist, add the outbound IPs of
the web app and worker. Enable the product, media space, order, payment, logistics, and shop
permissions in the Shopee app, and configure its live push callback.

## Publish and synchronize

- A listing uses one SKU. SellBridge assigns it a stable reference beginning with `SB-` in
  Shopee so the worker can recover a creation when the response was lost. SellBridge uses the
  Shopee category recommendation and matches
  the category's attributes and brand against the product information already saved.
- Set the product's price, description, weight, package dimensions, and public HTTPS photos
  (JPG or PNG). The connector uses the shop's enabled shipping channels with compatible sizes
  and weights. Add missing required information before retrying a refused publication.
- Store stock and price are updated by the worker on the published item. Standard listings use
  the shop's default stock location. `SHOPEE_SHOWCASE_UNITS` is the existing extra display-stock
  setting for Shopee. Set it to `0` to send only sellable stock after the safety buffer.

## Import orders and print labels

- Order status pushes trigger an authenticated read of the sale. A scheduled check recovers
  recent missing orders and status changes, and reconnection queues a catch-up for the shop.
  Imported items are linked to SellBridge listings by the Shopee item ID.
- On an eligible order, use **Gerar etiqueta da Shopee**. For supported channels, SellBridge
  arranges drop-off or a pickup with an unambiguous address and time, requests the standard PDF
  from Shopee, and downloads it when ready. If Shopee is still processing it, try again shortly.
- Submit any required NF-e in Seller Center before requesting the label. Use Seller Center
  when Shopee requires a shipping choice, the order is split into multiple marketplace packages,
  or the channel only offers a thermal label.

## OAuth reference

| Environment | Authorization URL                                  | API origin                                           |
| ----------- | -------------------------------------------------- | ---------------------------------------------------- |
| Production  | `https://open.shopee.com.br/auth`                  | `https://openplatform.shopee.com.br`                 |
| Sandbox V2  | `https://open.sandbox.test-stable.shopee.com/auth` | `https://openplatform.sandbox.test-stable.shopee.sg` |

- SellBridge sends `partner_id`, `auth_type=seller`, `redirect_uri`, `response_type=code`, and a
  one-time `state`. It also includes `state` in the callback URI. The shop callback sends `code`
  and `shop_id`. A main account can return `main_account_id` instead. Connect with the shop account
  so the connector has a `shop_id` to exchange for tokens.
- `POST /api/v2/auth/token/get` exchanges the code. `GET /api/v2/shop/get_shop_info` verifies that
  the shop is active and in Brazil (`BR`). `POST /api/v2/auth/access_token/get` rotates the
  access and refresh tokens for that shop. The access token typically expires in four hours.
  Refresh tokens are single use and replacement tokens are stored by the worker.
- API requests use HMAC-SHA256 over `partner_id + path + timestamp`. Shop calls append
  `access_token + shop_id`. The API request URL carries the access token, so it is kept out of logs.
- SellBridge uses mocked Shopee responses for automated coverage. Validate the complete flow
  with a sandbox shop before using it in production.

[Shopee API calls](https://open.shopee.com/developer-guide/16) ·
[Authorization and Authentication](https://open.shopee.com/developer-guide/20) ·
[Go Live](https://open.shopee.com/developer-guide/741) ·
[Create an item](https://open.shopee.com/documents/v2/v2.product.add_item?module=89&type=1) ·
[Order detail](https://open.shopee.com/documents/v2/v2.order.get_order_detail?module=94&type=1) ·
[Order Status Update Push](https://open.shopee.com/push-mechanism/1) ·
[Arrange shipment and print a label](https://open.shopee.com/developer-guide/27) ·
[Sandbox V2 guide snapshot](https://kgcang.com/library/doc/sources%2Fshopee%2Fprofile.shopee.developer_guide%2Fgetting-started%2F%E6%B2%99%E7%AE%B1%E6%B5%8B%E8%AF%95-v2-0)
