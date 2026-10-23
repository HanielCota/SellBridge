import type {
  CarrierEventKind,
  CarrierTrackingEvent,
  CarrierTrackingResult,
} from "./carrier-tracking";

const HOUR_MILLISECONDS = 3_600_000;

/** Without a dispatch date the story starts this long before now. */
const DEFAULT_LOOKBACK_HOURS = 120;

interface SimulatedStep {
  afterHours: number;
  kind: CarrierEventKind;
  description: string;
  place: number;
}

const POSTED: Omit<SimulatedStep, "afterHours"> = {
  kind: "posted",
  description: "Objeto postado",
  place: 0,
};

function step(afterHours: number, rest: Omit<SimulatedStep, "afterHours">): SimulatedStep {
  return { afterHours, ...rest };
}

function inTransit(afterHours: number, place: number): SimulatedStep {
  return step(afterHours, {
    kind: "in_transit",
    description: "Objeto em transferência entre unidades",
    place,
  });
}

function outForDelivery(afterHours: number): SimulatedStep {
  return step(afterHours, {
    kind: "out_for_delivery",
    description: "Objeto saiu para entrega ao destinatário",
    place: 3,
  });
}

function failedAttempt(afterHours: number): SimulatedStep {
  return step(afterHours, {
    kind: "delivery_failed",
    description: "Destinatário ausente: nova tentativa no próximo dia útil",
    place: 3,
  });
}

/** One story per scenario; the code picks one, so the same code always tells the same story. */
const SCENARIOS: readonly (readonly SimulatedStep[])[] = [
  [
    step(4, POSTED),
    inTransit(20, 1),
    inTransit(44, 2),
    outForDelivery(70),
    step(76, { kind: "delivered", description: "Objeto entregue ao destinatário", place: 3 }),
  ],
  [step(3, POSTED), inTransit(22, 1), inTransit(50, 2)],
  [step(5, POSTED), inTransit(24, 1), inTransit(48, 2), outForDelivery(72), failedAttempt(78)],
  [
    step(2, POSTED),
    inTransit(20, 1),
    outForDelivery(60),
    failedAttempt(66),
    failedAttempt(90),
    step(100, {
      kind: "returning",
      description: "Objeto em devolução ao remetente",
      place: 2,
    }),
  ],
  // The carrier's first scan comes three days after the dispatch: a slow collection.
  [step(74, POSTED), inTransit(96, 1)],
  [
    step(4, POSTED),
    inTransit(26, 1),
    step(54, {
      kind: "awaiting_pickup",
      description: "Objeto aguardando retirada na agência",
      place: 3,
    }),
  ],
];

const PLACES = ["Curitiba/PR", "São Paulo/SP", "Belo Horizonte/MG", "Rio de Janeiro/RJ"] as const;

/** FNV-1a: a stable number from the code, so a code always maps to the same scenario. */
function codeHash(code: string): number {
  let hash = 0x811c9dc5;
  for (const character of code) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 0x01000193);
  }
  return hash >>> 0;
}

export function simulatedScenarioIndex(code: string): number {
  return codeHash(code) % SCENARIOS.length;
}

/** The step's moment, rounded to the minute so the list reads like a real carrier's. */
function stepTime(anchor: Date, simulatedStep: SimulatedStep): Date {
  const time = anchor.getTime() + simulatedStep.afterHours * HOUR_MILLISECONDS;
  return new Date(Math.floor(time / 60_000) * 60_000);
}

export interface SimulatedTrackingRequest {
  code: string;
  /** When the parcel was handed over (the supplier's "enviado"); null for a typed code. */
  handedOverAt: Date | null;
  now: Date;
}

/**
 * Demonstration events for local use: deterministic for a code and a dispatch date, and never
 * in the future. Nothing leaves the server.
 */
export function simulatedCarrierTracking(request: SimulatedTrackingRequest): CarrierTrackingResult {
  const anchor =
    request.handedOverAt ??
    new Date(request.now.getTime() - DEFAULT_LOOKBACK_HOURS * HOUR_MILLISECONDS);
  const scenario = SCENARIOS[simulatedScenarioIndex(request.code)] ?? [];
  const events: CarrierTrackingEvent[] = scenario
    .map((simulatedStep) => ({
      at: stepTime(anchor, simulatedStep),
      place: PLACES[simulatedStep.place] ?? null,
      kind: simulatedStep.kind,
      description: simulatedStep.description,
    }))
    .filter((event) => event.at.getTime() <= request.now.getTime());
  return { state: "found", carrier: "Correios", simulated: true, events };
}
