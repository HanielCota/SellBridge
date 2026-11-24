import {
  missingWeightNote,
  type RatesSource,
  ratesNote,
} from "@/features/listings/mercado-livre-rates-note";

/** How sure the preview's fees are, and whether shipping was priced without the weight. */
export function RatesNotes({
  ratesSource,
  weightGrams,
}: {
  ratesSource: RatesSource | null;
  weightGrams: number | null | undefined;
}) {
  const weightNote = missingWeightNote(weightGrams);
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>{ratesNote(ratesSource)}</p>
      {weightNote === null ? null : <p>{weightNote}</p>}
    </div>
  );
}
