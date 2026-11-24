import { environment } from "./environment";

/**
 * Buyer questions are answered in SellBridge (BUYER_QUESTIONS_ENABLED, decision of 21/11/2026).
 * Off, the page answers as missing and the menu, badge and bell leave questions out.
 */
export function buyerQuestionsEnabled(): boolean {
  return environment.BUYER_QUESTIONS_ENABLED;
}
