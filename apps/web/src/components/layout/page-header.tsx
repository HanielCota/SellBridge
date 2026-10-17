import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface BackLinkProps {
  /** A list page; detail pages go back to their list, which takes no parameters. */
  to: NonNullable<LinkProps["to"]>;
  /** Where it goes, in the words of that page's title ("Suporte", "Clientes"). */
  label: string;
}

/**
 * The one way back from a detail page: a ghost link above the title, aligned with the text
 * (U-7: before it was built four different ways). Hidden when printing.
 */
export function BackLink({ to, label }: BackLinkProps) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit print:hidden">
      <Link to={to}>
        <ArrowLeftIcon aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** A `BackLink`, shown above the title. */
  back?: ReactNode;
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div className="space-y-2">
      {back}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
