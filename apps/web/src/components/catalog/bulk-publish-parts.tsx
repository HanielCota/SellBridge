/** "1 loja", "3 lojas": a count with the right noun. */
export function pluralize(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

/** An inset group of rows under a caption, like iOS settings. */
export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 px-3.5 text-xs text-muted-foreground">{title}</legend>
      <div className="divide-y divide-border overflow-hidden rounded-2xl bg-muted/60">
        {children}
      </div>
    </fieldset>
  );
}
