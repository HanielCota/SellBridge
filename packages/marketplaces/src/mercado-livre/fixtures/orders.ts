/**
 * Mercado Livre orders as `GET /orders/{id}` returns them. Field names follow the official
 * "Gerenciamento de vendas" page (developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas,
 * read on 2026-10-13); the values are ours, since the docs show no refunded or fraud example.
 */
const base = {
  id: 2000003508897196,
  status: "paid",
  status_detail: null,
  date_created: "2026-03-01T10:00:00.000-03:00",
  total_amount: 100,
  buyer: { id: 1281407372, nickname: "COMPRADOR" },
  order_items: [
    { item: { id: "MLB1", title: "Camiseta" }, quantity: 2, unit_price: 50, sale_fee: 6 },
  ],
  tags: ["paid"],
  mediations: [],
  payments: [
    {
      id: 21463688923,
      status: "approved",
      status_detail: "accredited",
      transaction_amount: 100,
      transaction_amount_refunded: 0,
      total_paid_amount: 100,
      date_last_modified: "2026-03-01T10:05:00.000-03:00",
    },
  ],
};

export const ORDER_FIXTURES = {
  confirmed: { ...base, status: "confirmed", tags: [], payments: [] },
  payment_required: { ...base, status: "payment_required", tags: [], payments: [] },
  payment_in_process: { ...base, status: "payment_in_process", tags: [] },
  partially_paid: { ...base, status: "partially_paid", tags: [] },
  paid: base,
  paid_and_delivered: { ...base, tags: ["paid", "delivered"] },
  partially_refunded: {
    ...base,
    status: "partially_refunded",
    tags: ["paid", "delivered"],
    payments: [{ ...base.payments[0], transaction_amount_refunded: 20 }],
  },
  fraud_risk_detected: { ...base, tags: ["paid", "fraud_risk_detected"] },
  pending_cancel: { ...base, status: "pending_cancel" },
  cancelled: {
    ...base,
    status: "cancelled",
    tags: ["not_delivered"],
    cancel_detail: {
      group: "buyer",
      code: "buyer_cancel_express",
      description: "Cancelada pelo comprador",
      requested_by: "buyer",
      date: "2026-03-02T09:00:00.000-03:00",
    },
  },
  invalid: { ...base, status: "invalid" },
  unknown: { ...base, status: "something_new" },
};
