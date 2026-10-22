import { PackageIcon, StorefrontIcon, type Icon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { cn } from "@/lib/utils";

interface ProfileOption {
  readonly kind: ProfileKind;
  readonly title: string;
  readonly summary: string;
  readonly icon: Icon;
}

const PROFILE_OPTIONS: readonly ProfileOption[] = [
  {
    kind: "seller",
    title: "Quero vender",
    summary: "Venda produtos de fornecedores nas suas lojas.",
    icon: StorefrontIcon,
  },
  {
    kind: "supplier",
    title: "Quero fornecer",
    summary: "Cadastre seus produtos para revendedores.",
    icon: PackageIcon,
  },
];

interface SignUpProfileChoiceProps {
  readonly value: ProfileKind;
  readonly onChange: (kind: ProfileKind) => void;
}

/** Seller or supplier, picked before the form: the rest of the sign-up follows this choice. */
export function SignUpProfileChoice({ value, onChange }: SignUpProfileChoiceProps) {
  return (
    <div role="radiogroup" aria-label="Tipo de conta" className="grid grid-cols-2 gap-3">
      {PROFILE_OPTIONS.map((option) => (
        <ProfileOptionCard
          key={option.kind}
          option={option}
          checked={option.kind === value}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function ProfileOptionCard({
  option,
  checked,
  onChange,
}: {
  option: ProfileOption;
  checked: boolean;
  onChange: (kind: ProfileKind) => void;
}) {
  const OptionIcon = option.icon;
  return (
    <label
      className={cn(
        "surface-card relative flex cursor-pointer flex-col gap-2 rounded-3xl bg-card p-4 transition-[box-shadow,transform] duration-100 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        "has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-ring/30",
        checked ? "ring-2 ring-brand" : "hover:ring-1 hover:ring-border",
      )}
    >
      <input
        type="radio"
        name="profileKind"
        value={option.kind}
        checked={checked}
        onChange={() => onChange(option.kind)}
        className="sr-only"
      />
      <OptionIcon
        aria-hidden="true"
        weight={checked ? "fill" : "regular"}
        className={cn("size-6", checked ? "text-brand-text" : "text-muted-foreground")}
      />
      <span className="text-body font-semibold">{option.title}</span>
      <span className="text-footnote text-muted-foreground">{option.summary}</span>
    </label>
  );
}
