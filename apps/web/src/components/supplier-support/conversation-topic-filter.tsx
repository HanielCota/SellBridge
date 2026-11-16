import {
  SUPPLIER_CONVERSATION_TOPIC_IDS,
  SUPPLIER_CONVERSATION_TOPIC_LABELS,
  type SupplierConversationTopicId,
} from "@sellbridge/shared/supplier-conversation-topics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL_TOPICS = "__all__";

/** "Todos os assuntos" plus one option per conversation topic; undefined means no filter. */
export function ConversationTopicFilter({
  value,
  onChange,
  className,
}: {
  value: SupplierConversationTopicId | undefined;
  onChange: (topic: SupplierConversationTopicId | undefined) => void;
  className?: string;
}) {
  return (
    <Select
      value={value ?? ALL_TOPICS}
      onValueChange={(next) =>
        onChange(SUPPLIER_CONVERSATION_TOPIC_IDS.find((topic) => topic === next))
      }
    >
      <SelectTrigger className={cn("h-11 w-full sm:h-9 sm:w-56", className)} aria-label="Assunto">
        <SelectValue>
          {value === undefined ? "Todos os assuntos" : SUPPLIER_CONVERSATION_TOPIC_LABELS[value]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_TOPICS}>Todos os assuntos</SelectItem>
        {SUPPLIER_CONVERSATION_TOPIC_IDS.map((topic) => (
          <SelectItem key={topic} value={topic}>
            {SUPPLIER_CONVERSATION_TOPIC_LABELS[topic]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
