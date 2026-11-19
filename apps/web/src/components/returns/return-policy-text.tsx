import { cn } from "@/lib/utils";

/** Who pays what, in the words both sides read (Guilherme, 18/11/2026). */
const WHO_PAYS = [
  {
    when: "Defeito, avaria ou produto errado",
    outcome: "o fornecedor devolve o custo do produto e paga o frete de volta.",
  },
  {
    when: "O comprador desistiu ou não recebeu",
    outcome: "o fornecedor devolve o custo do produto; o frete de volta fica com o revendedor.",
  },
] as const;

const STEPS = [
  "O revendedor conta por que o comprador devolveu. Em defeito, avaria ou produto errado, manda fotos.",
  "O fornecedor confere o produto no prazo que aparece na devolução e diz se está como o revendedor contou e se dá para vender de novo.",
  "Sem resposta no prazo, vale o que o revendedor contou.",
  "Se o pacote voltar para o endereço do revendedor, ele reenvia ao fornecedor em até 7 dias. O prazo do fornecedor começa quando o pacote chega.",
  "Se o produto dá para vender de novo, o estoque volta sozinho.",
  "Se os dois não concordarem, a equipe SellBridge olha as fotos e decide.",
] as const;

/**
 * The return policy, the same text for the supplier (golden rules) and the reseller (its own
 * page and each return), so neither side reads a different version.
 */
export function ReturnPolicyText({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 text-sm", className)}>
      <ul className="grid gap-2">
        {WHO_PAYS.map((rule) => (
          <li key={rule.when} className="rounded-2xl bg-muted px-4 py-3">
            <span className="font-semibold">{rule.when}:</span> {rule.outcome}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        As taxas do marketplace ficam com o revendedor. O valor que o fornecedor deve fica anotado
        em cada devolução.
      </p>
      <ol className="grid list-decimal gap-1.5 pl-5">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
