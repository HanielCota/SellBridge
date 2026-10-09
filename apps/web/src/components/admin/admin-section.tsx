import type { ReactNode } from "react";

interface AdminSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** One block of the customer page: a plain heading, a short explanation, the controls. */
export function AdminSection({ title, description, children }: AdminSectionProps) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
