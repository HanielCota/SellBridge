import { Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";

const LINK_CLASS_NAME = "text-foreground underline underline-offset-2";

/** "Li e aceito…" with links to both documents; the sign-up and /aceitar-termos use it. */
export function TermsConsentCheckbox({
  checked,
  invalid,
  onCheckedChange,
}: {
  checked: boolean;
  invalid: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="accept-terms"
        checked={checked}
        aria-invalid={invalid}
        onCheckedChange={(state) => onCheckedChange(state === true)}
        className="mt-0.5"
      />
      <label htmlFor="accept-terms" className="text-footnote leading-relaxed text-muted-foreground">
        Li e aceito os{" "}
        <Link to="/termos" target="_blank" className={LINK_CLASS_NAME}>
          termos de uso
        </Link>{" "}
        e a{" "}
        <Link to="/privacidade" target="_blank" className={LINK_CLASS_NAME}>
          política de privacidade
        </Link>
        .
      </label>
    </div>
  );
}
