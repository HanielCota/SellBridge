import {
  SUPPLIER_CONVERSATION_TOPICS,
  type SupplierConversationTopicId,
} from "@sellbridge/shared/supplier-conversation-topics";
import {
  ArrowsClockwiseIcon,
  ChatCircleDotsIcon,
  CubeIcon,
  type Icon,
  PackageIcon,
  TagIcon,
} from "@phosphor-icons/react";
import { OPTION_CLASS } from "@/components/support/new-ticket/choice-steps";
import {
  moveChoiceFocus,
  STEP_HEADING_IDS,
  StepHeading,
} from "@/components/support/new-ticket/step-parts";
import { cn } from "@/lib/utils";

const TOPIC_ICONS: Record<SupplierConversationTopicId, Icon> = {
  order: PackageIcon,
  return: ArrowsClockwiseIcon,
  stock_price: TagIcon,
  product: CubeIcon,
  other: ChatCircleDotsIcon,
};

/** Step two, the same choice cards as "Abrir chamado": what the reseller wants to talk about. */
export function ConversationTopicStep({
  total,
  onPick,
}: {
  total: number;
  onPick: (topic: SupplierConversationTopicId) => void;
}) {
  return (
    <div className="grid gap-3">
      <StepHeading
        id={STEP_HEADING_IDS.topic}
        number={2}
        total={total}
        question="Sobre o que é?"
        help="Escolha o mais próximo. Dá para mudar depois."
      />
      <fieldset
        aria-labelledby={STEP_HEADING_IDS.topic}
        className="m-0 grid min-w-0 grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-2"
      >
        {SUPPLIER_CONVERSATION_TOPICS.map((topic) => {
          const TopicIcon = TOPIC_ICONS[topic.id];
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => onPick(topic.id)}
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
