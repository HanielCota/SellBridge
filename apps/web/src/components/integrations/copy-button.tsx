import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const COPIED_FEEDBACK_MILLISECONDS = 2000;

/** Copies `value` and confirms in place, so the person sees it worked without looking away. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MILLISECONDS);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      <Icon aria-hidden="true" />
      {copied ? "Copiado" : label}
    </Button>
  );
}
