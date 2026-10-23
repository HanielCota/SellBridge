/**
 * What the support assistant answered before the customer asked for a person, at the top of the
 * team's thread: the agent starts from what was already suggested instead of repeating it.
 */
export function AssistantAnswerNote({ answer }: { answer: { body: string } | null }) {
  if (answer === null) {
    return null;
  }
  return (
    <section
      aria-label="Resposta automática"
      className="space-y-1.5 rounded-2xl border border-dashed px-4 py-3"
    >
      <h2 className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Assistente do suporte</span> · resposta
        automática que o cliente viu antes de pedir ajuda
      </h2>
      <p className="text-sm break-words whitespace-pre-wrap">{answer.body}</p>
    </section>
  );
}
