import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";

/** Public supplier page, like the legal ones: the brand on the grouped background, no app navigation. */
export function SupplierPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-surface-grouped">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-6">
        <BrandLogo className="text-xl" iconClassName="size-8" />
        <span className="text-subhead text-muted-foreground">Portal do fornecedor</span>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
