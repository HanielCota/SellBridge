import { LightningIcon } from "@phosphor-icons/react";
import { IconAction } from "@/components/support/composer-parts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fillTemplate,
  type ReplyTemplate,
  type TemplateContext,
} from "@/features/support/reply-templates";

/** Ready answers to the customer; only offered while replying, never inside an internal note. */
export function TemplateMenu({
  templates,
  context,
  onPick,
}: {
  templates: readonly ReplyTemplate[];
  context: TemplateContext;
  onPick: (template: ReplyTemplate) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconAction label="Respostas prontas">
          <LightningIcon aria-hidden="true" />
        </IconAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Respostas prontas
        </DropdownMenuLabel>
        {templates.map((template) => (
          <DropdownMenuItem
            key={template.id}
            className="flex-col items-start gap-0.5"
            onSelect={() => onPick(template)}
          >
            <span className="font-medium text-foreground">{template.label}</span>
            <span className="line-clamp-1 text-xs">{fillTemplate(template.body, context)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
