import type { ComponentProps } from "react";

type KeyboardProps = Pick<
  ComponentProps<"input">,
  "inputMode" | "autoCapitalize" | "autoCorrect" | "spellCheck" | "enterKeyHint"
>;

const TYPED_ENTRY: KeyboardProps = { autoCapitalize: "off", autoCorrect: "off", spellCheck: false };

/**
 * Keyboard defaults for an input type: an e-mail or a URL is typed exactly, so the phone neither
 * capitalizes nor "corrects" it, and it opens the keyboard with @ or / at hand. A field's own
 * props still win; this only fills what the field leaves out.
 */
export function keyboardDefaultsForType(type: string | undefined): KeyboardProps {
  if (type === "email") {
    return { ...TYPED_ENTRY, inputMode: "email" };
  }
  if (type === "url") {
    return { ...TYPED_ENTRY, inputMode: "url" };
  }
  if (type === "password") {
    return TYPED_ENTRY;
  }
  if (type === "search") {
    return { enterKeyHint: "search" };
  }
  return {};
}
