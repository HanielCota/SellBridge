/**
 * Mercado Livre shipments as `GET /shipments/{id}` returns them (header `x-format-new: true`).
 * Statuses and substatuses come from the official "Gerenciamento de envios" page
 * (developers.mercadolivre.com.br/pt_br/gerenciamento-de-envios, `GET /shipment_statuses`,
 * read on 2026-10-13); ids, dates and addresses are ours.
 */
export const shipmentBase = {
  id: 46803546483,
  status: "ready_to_ship",
  substatus: "ready_to_print",
  mode: "me2",
  logistic_type: "drop_off",
  tracking_number: "ML123",
  tracking_method: "Mercado Envios",
  destination: {
    receiver_name: "Maria Silva",
    shipping_address: {
      street_name: "Rua das Flores",
      street_number: "10",
      zip_code: "01001000",
      neighborhood: { name: "Centro" },
      city: { name: "São Paulo" },
      state: { id: "BR-SP" },
    },
  },
};

function shipment(status: string, substatus: string | null) {
  return { ...shipmentBase, status, substatus };
}

export const SHIPMENT_FIXTURES = {
  pending: shipment("pending", null),
  handling: shipment("handling", null),
  ready_to_print: shipment("ready_to_ship", "ready_to_print"),
  dropped_off: shipment("ready_to_ship", "dropped_off"),
  shipped: shipment("shipped", null),
  out_for_delivery: shipment("shipped", "out_for_delivery"),
  receiver_absent_in_route: shipment("shipped", "receiver_absent"),
  delivered: shipment("delivered", null),
  delivered_inferred: shipment("delivered", "inferred"),
  not_delivered_receiver_absent: shipment("not_delivered", "receiver_absent"),
  not_delivered_returning: shipment("not_delivered", "returning_to_sender"),
  not_delivered_lost: shipment("not_delivered", "lost"),
  returned: shipment("not_delivered", "returned"),
  returned_to_warehouse: shipment("not_delivered", "returned_to_warehouse"),
  cancelled: shipment("cancelled", "cancelled_manually"),
  stale_shipped: shipment("stale_shipped", null),
  unknown: shipment("something_new", null),
};
