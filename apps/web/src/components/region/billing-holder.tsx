import { ReceiptIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** The client's wording: the holder data goes on invoices and charges, so it must be right. */
export function BillingNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <ReceiptIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Os dados informados neste cadastro serão utilizados para emissão de notas fiscais e cobranças.
      Confira se estão corretos.
    </p>
  );
}

interface SignupStep {
  title: string;
}

/** Where the reseller is in a short form split into steps: one bar per step, filled up to here. */
export function StepProgress({
  steps,
  current,
}: {
  steps: readonly SignupStep[];
  current: number;
}) {
  const step = steps[current];
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((item, index) => (
          <span
            key={item.title}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
              index <= current ? "bg-brand" : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="text-footnote text-muted-foreground" aria-live="polite">
        Etapa {current + 1} de {steps.length}
        {step ? ` · ${step.title}` : null}
      </p>
    </div>
  );
}
