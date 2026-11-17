/**
 * Responses copied from the official pages ("Gerenciar reclamações", 20/08/2026; "Gerenciar
 * devoluções", 22/12/2025; "Envios", "Vendas associadas a um envio"), trimmed of fields the
 * integration does not read. The seller of the claim example is 1330467461.
 */
export const CLAIM_SELLER_ID = "1330467461";

export const CLOSED_CLAIM = {
  id: 5256749420,
  resource_id: 2000007819609432,
  status: "closed",
  type: "mediations",
  stage: "claim",
  parent_id: null,
  resource: "order",
  reason_id: "PDD9549",
  fulfilled: true,
  quantity_type: "total",
  claimed_quantity: 1,
  claim_version: 2.0,
  players: [
    { role: "complainant", type: "buyer", user_id: 1325224382, available_actions: [] },
    { role: "respondent", type: "seller", user_id: 1330467461, available_actions: [] },
  ],
  resolution: {
    reason: "payment_refunded",
    date_created: "2024-03-21T05:19:22.000-04:00",
    benefited: ["complainant"],
    closed_by: "respondent",
    applied_coverage: false,
  },
  site_id: "MLB",
  date_created: "2024-03-14T08:28:44.000-04:00",
  last_updated: "2024-03-21T05:19:22.000-04:00",
  related_entities: [],
};

export const OPEN_RETURN_CLAIM = {
  ...CLOSED_CLAIM,
  status: "opened",
  stage: "dispute",
  resolution: null,
  related_entities: ["return"],
  last_updated: "2024-03-15T10:00:00.000-04:00",
};

export const CLAIM_DETAIL = {
  due_date: "2023-07-19T22:33:00.000-04:00",
  action_responsible: "mediator",
  title: "Devolución en mediación con Mercado Libre",
  description: "Intervinimos para ayudar. Te escribiremos antes del miércoles 19 de julio.",
  problem: "Nos dijiste que el producto llegó dañado",
};

export const CLAIM_RETURN = {
  id: 57341011,
  last_updated: "2024-09-10T17:26:41.704+00:00",
  shipments: [
    {
      shipment_id: 43810672299,
      status: "delivered",
      tracking_number: null,
      destination: { name: "warehouse" },
      type: "return",
    },
    {
      shipment_id: 43825249694,
      status: "pending",
      tracking_number: null,
      destination: { name: "seller_address" },
      type: "return_from_triage",
    },
  ],
  refund_at: "delivered",
  date_closed: null,
  resource_type: "order",
  date_created: "2024-09-06T16:24:26.636+00:00",
  claim_id: 5298178312,
  status_money: "retained",
  resource_id: 2000009229357366,
  subtype: "return_total",
  status: "delivered",
  related_entities: ["reviews"],
  intermediate_check: true,
};

export const SHIPMENT_ORDERS = [
  { order_id: "2000014428837134", pack_id: "2000015428123455", seller_id: 12345 },
  { order_id: "2000014428837136", pack_id: "2000015428123455", seller_id: 12345 },
  { order_id: "2000038294759239", pack_id: "2000015428123948", seller_id: 6789 },
];
