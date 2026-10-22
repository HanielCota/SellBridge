import {
  SHIPMENT_ACTORS,
  type FulfillmentStatus,
  type ShipmentOperator,
} from "@sellbridge/shared/schemas";

/*
 * "Mensagens do pedido" without a new table: a message is a shipment event written by the
 * reseller or the supplier with a note and the same status as the event before it, which is what
 * "Registrar ocorrência" always stored. Everything else is a step and stays in the history, so an
 * old occurrence and a new message read the same and no event shows twice.
 */

export interface ShipmentEventRecord {
  id: string;
  status: FulfillmentStatus;
  actor: string;
  note: string;
  createdAt: Date | string;
}

export interface OrderMessage {
  id: string;
  /** "Você" for the reader's own messages, otherwise the other side. */
  author: string;
  text: string;
  createdAt: Date | string;
}

const PEOPLE: ReadonlySet<string> = new Set([SHIPMENT_ACTORS.reseller, SHIPMENT_ACTORS.supplier]);

function oldestFirst<Event extends ShipmentEventRecord>(events: readonly Event[]): Event[] {
  return events
    .map((event, index) => ({ event, index, time: new Date(event.createdAt).getTime() }))
    .toSorted((left, right) => left.time - right.time || left.index - right.index)
    .map(({ event }) => event);
}

function isMessage(event: ShipmentEventRecord, previous: ShipmentEventRecord | undefined) {
  return (
    previous !== undefined &&
    previous.status === event.status &&
    PEOPLE.has(event.actor) &&
    event.note.trim() !== ""
  );
}

/** The conversation (oldest first) and the remaining steps of a shipment's events. */
export function splitShipmentEvents<Event extends ShipmentEventRecord>(
  events: readonly Event[],
  reader: ShipmentOperator,
): { messages: OrderMessage[]; steps: Event[] } {
  const ordered = oldestFirst(events);
  const ownLabel = SHIPMENT_ACTORS[reader];
  const messages: OrderMessage[] = [];
  const steps: Event[] = [];
  ordered.forEach((event, index) => {
    if (!isMessage(event, ordered[index - 1])) {
      steps.push(event);
      return;
    }
    messages.push({
      id: event.id,
      author: event.actor === ownLabel ? "Você" : event.actor,
      text: event.note.trim(),
      createdAt: event.createdAt,
    });
  });
  return { messages, steps };
}
