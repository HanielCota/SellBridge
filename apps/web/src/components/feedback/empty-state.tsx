import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

/** A line icon, what is missing, and the one action that fixes it. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="surface-card flex flex-col items-center justify-center gap-3 rounded-3xl bg-card px-6 py-16 text-center">
      <Icon className="size-8 text-muted-foreground" weight="light" aria-hidden="true" />
      <div className="max-w-sm space-y-1">
        <h2 className="text-subhead font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
