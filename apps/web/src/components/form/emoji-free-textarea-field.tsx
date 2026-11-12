import { hasEmoji, removeEmojis } from "@sellbridge/shared/emoji";
import { type ComponentProps, useState } from "react";
import { TextareaField } from "@/components/form/textarea-field";

/**
 * A description field that never holds an emoji: Mercado Livre refuses them, so whatever is typed
 * or pasted comes in without them, and the field says why.
 */
export function EmojiFreeTextareaField({
  onValueChange,
  ...props
}: ComponentProps<typeof TextareaField>) {
  const [removed, setRemoved] = useState(false);
  function change(next: string) {
    if (hasEmoji(next)) {
      setRemoved(true);
      onValueChange(removeEmojis(next));
      return;
    }
    onValueChange(next);
  }
  return (
    <div className="grid gap-2">
      <TextareaField {...props} onValueChange={change} />
      <output className="text-footnote text-muted-foreground empty:hidden">
        {removed ? "Tiramos os emojis: o Mercado Livre não aceita emojis na descrição." : ""}
      </output>
    </div>
  );
}
