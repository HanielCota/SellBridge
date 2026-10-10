import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** One block of a settings-style page: a plain heading, a short explanation, the controls. */
export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="surface-card rounded-3xl bg-card p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-subhead font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
