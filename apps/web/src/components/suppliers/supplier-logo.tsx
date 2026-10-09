/** Up to two initials from the meaningful words of a supplier name ("Casa do Pão" → "CP"). */
export function supplierInitials(name: string): string {
  const words = name.split(/\s+/).filter((word) => word.length > 2);
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return initials.length > 0 ? initials : name.charAt(0).toUpperCase();
}

/** The supplier's logo, or its initials on a tinted square when it has none. */
export function SupplierLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="size-11 shrink-0 rounded-lg border bg-muted"
        loading="lazy"
      />
    );
  }
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-brand-text"
      aria-hidden="true"
    >
      {supplierInitials(name)}
    </span>
  );
}
