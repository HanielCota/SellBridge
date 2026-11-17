/**
 * Runs every provider's payment round even when an earlier one fails, so one provider's error
 * never holds back the other's releases and refunds; the first failure is thrown once all ran.
 */
export async function runPaymentRounds(rounds: readonly (() => Promise<unknown>)[]): Promise<void> {
  const failures: unknown[] = [];
  for (const round of rounds) {
    try {
      await round();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw failures[0];
  }
}
