import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { SupportSituation, SupportTopic } from "@sellbridge/shared/support-topics";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";
import {
  CaretRightIcon,
  ChatCircleDotsIcon,
  CreditCardIcon,
  CubeIcon,
  type Icon,
  MegaphoneIcon,
  PackageIcon,
  PlugsConnectedIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { moveChoiceFocus, STEP_HEADING_IDS, StepHeading } from "./step-parts";

const TOPIC_ICONS: Record<TicketCategory, Icon> = {
  order: PackageIcon,
  payment: CreditCardIcon,
  store: PlugsConnectedIcon,
  listing: MegaphoneIcon,
  account: UserCircleIcon,
  other: ChatCircleDotsIcon,
};

/** A supplier's `listing` topic is its product catalog, not marketplace listings. */
function topicIcon(kind: ProfileKind, category: TicketCategory): Icon {
  if (kind === "supplier" && category === "listing") {
    return CubeIcon;
  }
  return TOPIC_ICONS[category];
}

/** Same look as the catalog's choice cards: card fill, a muted hover, a visible focus ring. */
export const OPTION_CLASS =
  "cursor-pointer text-left transition-[background-color,scale] duration-150 select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none active:scale-[0.98] active:duration-100 motion-reduce:active:scale-100";

export function TopicStep({
  kind,
  topics,
  onPick,
}: {
  kind: ProfileKind;
  topics: readonly SupportTopic[];
  onPick: (category: TicketCategory) => void;
}) {
  return (
    <div className="grid gap-3">
      <StepHeading
        id={STEP_HEADING_IDS.topic}
        number={1}
        total={3}
        question="Sobre o que é?"
        help="Escolha o mais próximo. Dá para mudar depois."
      />
      <fieldset
        aria-labelledby={STEP_HEADING_IDS.topic}
        className="m-0 grid min-w-0 grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-2 lg:grid-cols-3"
      >
        {topics.map((topic) => {
          const TopicIcon = topicIcon(kind, topic.category);
          return (
            <button
              key={topic.category}
              type="button"
              onClick={() => onPick(topic.category)}
              onKeyDown={moveChoiceFocus}
              className={cn(
                "flex items-start gap-2.5 rounded-2xl border bg-card px-3.5 py-3",
                OPTION_CLASS,
              )}
            >
              <TopicIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{topic.label}</span>
                <span className="block text-sm text-muted-foreground">{topic.legend}</span>
              </span>
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}

export function SituationStep({
  situations,
  onPick,
  step = { number: 2, total: 3 },
  help = "Assim a pessoa certa da equipe já recebe o seu chamado.",
}: {
  situations: readonly SupportSituation[];
  onPick: (situationId: string) => void;
  /** Where the step sits in the flow: a supplier conversation asks for the store first. */
  step?: { number: number; total: number };
  help?: string;
}) {
  return (
    <div className="grid gap-3">
      <StepHeading
        id={STEP_HEADING_IDS.situation}
        number={step.number}
        total={step.total}
        question="O que está acontecendo?"
        help={help}
      />
      <fieldset
        aria-labelledby={STEP_HEADING_IDS.situation}
        className="m-0 min-w-0 divide-y overflow-hidden rounded-2xl border p-0"
      >
        {situations.map((situation) => (
          <button
            key={situation.id}
            type="button"
            onClick={() => onPick(situation.id)}
            onKeyDown={moveChoiceFocus}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 focus-visible:ring-inset",
              OPTION_CLASS,
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{situation.label}</span>
              <span className="block text-sm text-muted-foreground">{situation.legend}</span>
            </span>
            <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </fieldset>
    </div>
  );
}
