/** "Correios · BR123", or just the code when the carrier is unknown (no dangling separator). */
export function trackingLine(carrier: string | null, trackingCode: string): string {
  return [carrier, trackingCode]
    .filter((part): part is string => part !== null && part.trim() !== "")
    .join(" · ");
}
