import {
  CheckCircleIcon,
  CircleNotchIcon,
  MapPinIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { FocusEventHandler } from "react";
import { FloatingTextField } from "@/components/form/floating-field";

/** Where the address lookup for the typed CEP stands. */
export type CepLookupStatus = "idle" | "searching" | "found" | "missing";

/** Up to 8 digits, with the dash added after the fifth as the user types. */
export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function LookupStatus({ status }: { status: CepLookupStatus }) {
  if (status === "idle") {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-center"
    >
      {status === "searching" ? (
        <CircleNotchIcon className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
      ) : null}
      {status === "found" ? (
        <CheckCircleIcon
          weight="fill"
          className="size-5 animate-in text-brand-text duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] zoom-in-50 fade-in motion-reduce:zoom-in-100"
        />
      ) : null}
      {status === "missing" ? (
        <WarningCircleIcon weight="fill" className="size-5 text-destructive" />
      ) : null}
    </span>
  );
}

/**
 * The CEP input: a pin at the start and, at the end, the state of the lookup (spinner, check or
 * warning), so the field itself answers "did it find my address?".
 */
export function CepField({
  value,
  errors,
  status,
  onValueChange,
  onBlur,
}: {
  value: string;
  errors: readonly unknown[];
  status: CepLookupStatus;
  onValueChange: (value: string) => void;
  onBlur: FocusEventHandler<HTMLInputElement>;
}) {
  return (
    <FloatingTextField
      id="cep"
      label="CEP"
      inputMode="numeric"
      autoComplete="postal-code"
      value={value}
      errors={errors}
      onBlur={onBlur}
      onValueChange={(next) => onValueChange(maskCep(next))}
      leading={<MapPinIcon className="size-5" aria-hidden="true" />}
      trailing={<LookupStatus status={status} />}
    />
  );
}
