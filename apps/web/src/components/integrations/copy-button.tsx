import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

const COPIED_FEEDBACK_MILLISECONDS = 2000;

/**
 * Copies `value` and confirms in place, so the person sees it worked without looking away.
 * With `children`, the button shows them (a code like "#A3F2C1") and `label` becomes its
 * accessible name.
 */
export function CopyButton({
  value,
  label,
  children,
  className,
}: {
  value: string;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    const isCopied = await copyToClipboard(value);
    if (!isCopied) {
      return;
    }
    setCopied(true);
    // A second click restarts the confirmation instead of having the first one cut it short.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MILLISECONDS);
  }

  const Icon = copied ? CheckIcon : CopyIcon;
  if (children === undefined) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        <Icon aria-hidden="true" />
        {copied ? "Copiado" : label}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-label={copied ? "Copiado" : label}
      className={cn("font-mono", className)}
      onClick={() => void copy()}
    >
      {children}
      <Icon className={copied ? "text-brand-text" : "text-muted-foreground"} aria-hidden="true" />
    </Button>
  );
}
