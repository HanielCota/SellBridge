import type { SupplierSupportReport } from "@sellbridge/shared/supplier-support-report";
import { HintedText } from "@/components/ui/hint";
import {
  cameBackCopy,
  finishedCopy,
  firstResponseCopy,
  onTimeCopy,
  receivedCopy,
  type FigureCopy,
} from "@/features/supplier-support/support-report-copy";

interface Figure extends FigureCopy {
  label: string;
  /** The legend of a name the supplier may not read the same way we do. */
  hint?: string;
}

function figuresOf(report: SupplierSupportReport): Figure[] {
  return [
    { label: "Recebidas", ...receivedCopy(report) },
    { label: "Primeira resposta", ...firstResponseCopy(report) },
    {
      label: "Respondidas em até 1 dia útil",
      hint: "Regra de ouro 4: a loja recebe resposta até o próximo dia útil. Mensagem de sexta ou sábado pode ser respondida até segunda.",
      ...onTimeCopy(report.answeredOnTime),
    },
    {
      label: "Finalizadas",
      hint: "Sozinhas: a conversa encerra quando a loja fica 7 dias sem responder.",
      ...finishedCopy(report.finished),
    },
    {
      label: "Voltaram",
      hint: "Conversas finalizadas em que a loja escreveu de novo em até 7 dias: o caso não tinha sido resolvido.",
      ...cameBackCopy(report.cameBack),
    },
  ];
}

function FigureLabel({ figure }: { figure: Figure }) {
  if (figure.hint === undefined) {
    return <dt className="text-sm text-muted-foreground">{figure.label}</dt>;
  }
  return (
    <dt className="text-sm text-muted-foreground">
      <HintedText label={figure.hint} className="hinted-term">
        {figure.label}
      </HintedText>
    </dt>
  );
}

/** The period's figures in one card, each with the sentence that says what it counts. */
export function ReportFigures({ report }: { report: SupplierSupportReport }) {
  return (
    <section
      aria-label={`Números dos últimos ${report.days} dias`}
      className="rounded-3xl bg-card p-5"
    >
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
        {figuresOf(report).map((figure) => (
          <div key={figure.label} className="space-y-1">
            <FigureLabel figure={figure} />
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">{figure.figure}</dd>
            <dd className="text-xs text-muted-foreground">{figure.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
