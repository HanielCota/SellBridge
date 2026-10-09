import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";

export interface LegalSection {
  title: string;
  paragraphs: readonly string[];
}

interface LegalPageProps {
  title: string;
  updatedAt: string;
  intro: string;
  sections: readonly LegalSection[];
  footer?: ReactNode;
}

/** Plain, readable layout for the Terms of Use and the Privacy Policy. */
export function LegalPage({ title, updatedAt, intro, sections, footer }: LegalPageProps) {
  return (
    <div className="min-h-svh bg-surface-grouped">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 py-6">
        <Link to="/" aria-label="SellBridge — início">
          <BrandLogo className="text-xl" iconClassName="size-8" />
        </Link>
        <Link to="/cadastro" className="text-[15px] font-medium text-brand-text">
          Criar conta
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-20">
        <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">Última atualização: {updatedAt}</p>
        <p className="mt-6 text-[17px] leading-relaxed font-light">{intro}</p>
        {sections.map((section) => (
          <section key={section.title} className="mt-10 space-y-3">
            <h2 className="text-xl font-medium tracking-[-0.01em]">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-[15px] leading-relaxed text-foreground/80">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        {footer}
      </main>
    </div>
  );
}
