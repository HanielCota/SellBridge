import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

/** Quiet empty state: a line icon, what is missing, and the one action that fixes it. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <Icon className="size-9 text-muted-foreground/70" weight="light" aria-hidden="true" />
      <div className="max-w-sm space-y-1">
        <h3 className="text-[15px] font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
