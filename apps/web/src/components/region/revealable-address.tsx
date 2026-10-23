import {
  formatBillingAddress,
  maskBillingAddress,
  type BillingAddress,
} from "@sellbridge/shared/billing-address";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The billing address hidden until asked, like a password: the screen may be open where others
 * can read it. Street, number, district and CEP stay masked; city and state tell which it is.
 */
export function RevealableAddress({
  address,
  className,
}: {
  address: BillingAddress;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ToggleIcon = isVisible ? EyeSlashIcon : EyeIcon;
  const [firstLine, secondLine] = formatBillingAddress(address);
  return (
    <div className={cn("flex items-start justify-between gap-2", className)}>
      <p className="min-w-0 text-sm break-words" data-testid="billing-address">
        {isVisible ? (
          <>
            <span className="block">{firstLine}</span>
            <span className="block text-muted-foreground">{secondLine}</span>
          </>
        ) : (
          <span className="block tracking-wide">{maskBillingAddress(address)}</span>
        )}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        // The hit area grows to 44px for a finger without moving the 32px circle.
        className="relative -my-1 shrink-0 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground"
        aria-label={isVisible ? "Ocultar endereço" : "Mostrar endereço"}
        aria-pressed={isVisible}
        onClick={() => setIsVisible((visible) => !visible)}
      >
        <ToggleIcon className="size-[18px]" aria-hidden="true" />
      </Button>
    </div>
  );
}
