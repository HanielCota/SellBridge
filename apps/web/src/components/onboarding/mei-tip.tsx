import { LightbulbIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * A plain suggestion for who sells with a CPF: nothing is blocked, a CPF seller keeps selling
 * (decision of 18/11/2026, "Vamos de A"). With a CNPJ the sale's NF-e goes out in the company's
 * name (venda à ordem).
 */
export function MeiTip({
  showProfileLink = false,
  className,
}: {
  /** Off on the profile page itself, where the company box is right above. */
  showProfileLink?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex gap-2 rounded-2xl bg-muted/60 p-3 text-footnote text-muted-foreground",
        className,
      )}
    >
      <LightbulbIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-medium text-foreground">
          Se você vende com frequência, abra um MEI.
        </span>{" "}
        Com CNPJ, a nota de venda sai no nome da sua empresa.{" "}
        {showProfileLink ? (
          <Link to="/onboarding" search={{ step: "details" }} className="font-medium underline">
            Cadastrar CNPJ
          </Link>
        ) : (
          "Quando tiver, marque “Vendo como empresa (CNPJ)”."
        )}
      </span>
    </p>
  );
}
