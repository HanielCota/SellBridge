import type { ContractDocument } from "@sellbridge/shared/contract-documents";
import {
  SIGNING_CODE_LENGTH,
  SIGNING_CODE_RESEND_WAIT_IN_SECONDS,
  uncheckedSummaryItems,
} from "@sellbridge/shared/contract-signing";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { requestContractCodeFn, signContractFn } from "./contract-signing.functions";

const ONE_SECOND_IN_MS = 1000;

function uncheckedMessage(total: number): string {
  if (total === 1) {
    return "Falta marcar 1 ponto. Ele está destacado acima.";
  }
  return `Falta marcar ${total} pontos. Eles estão destacados acima.`;
}

/** The checkbox of a summary line, shared with the step that draws it. */
export function summaryItemElementId(itemId: string): string {
  return `contract-item-${itemId}`;
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Counts down to zero once a second while above zero. */
function useCountdown(): [number, (seconds: number) => void] {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer =
      seconds > 0 ? setTimeout(() => setSeconds(seconds - 1), ONE_SECOND_IN_MS) : undefined;
    return () => clearTimeout(timer);
  }, [seconds]);
  return [seconds, setSeconds];
}

function useSummaryChoice(contract: ContractDocument) {
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  function toggle(itemId: string, checked: boolean) {
    const next = new Set(confirmed);
    if (checked) {
      next.add(itemId);
    }
    if (!checked) {
      next.delete(itemId);
    }
    setConfirmed(next);
    const remaining = new Set(highlighted);
    remaining.delete(itemId);
    setHighlighted(remaining);
  }
  /** Highlights what is unticked, moves to the first one and says so; null when all are ticked. */
  function missingMessage(): string | null {
    const unchecked = uncheckedSummaryItems(contract, [...confirmed]);
    setHighlighted(new Set(unchecked));
    const [first] = unchecked;
    if (first === undefined) {
      return null;
    }
    document.getElementById(summaryItemElementId(first))?.focus();
    return uncheckedMessage(unchecked.length);
  }
  return { confirmed, highlighted, toggle, missingMessage };
}

/** Asking for a code: where it went, and the wait before another one. */
function useCodeRequest(contract: ContractDocument, confirmed: ReadonlySet<string>) {
  const [sentTo, setSentTo] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [resendWaitInSeconds, setResendWait] = useCountdown();
  /** Sends a code; reports a failure through `showError` and says whether it went out. */
  async function send(showError: (message: string | null) => void): Promise<boolean> {
    setIsSending(true);
    showError(null);
    try {
      const sent = await requestContractCodeFn({
        data: { version: contract.version, confirmedItemIds: [...confirmed] },
      });
      setSentTo(sent.sentTo);
      setResendWait(SIGNING_CODE_RESEND_WAIT_IN_SECONDS);
      return true;
    } catch (failure) {
      showError(errorMessage(failure));
      return false;
    } finally {
      setIsSending(false);
    }
  }
  return { sentTo, isSending, resendWaitInSeconds, send };
}

/** Typing the code and signing with it. */
function useCodeEntry(
  contract: ContractDocument,
  confirmed: ReadonlySet<string>,
  onSigned: (signedAt: string) => Promise<void>,
) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  async function sign() {
    if (code.length !== SIGNING_CODE_LENGTH) {
      setError(`Digite os ${SIGNING_CODE_LENGTH} números do código enviado ao seu e-mail.`);
      return;
    }
    setIsSigning(true);
    setError(null);
    try {
      const signed = await signContractFn({
        data: {
          version: contract.version,
          confirmedItemIds: [...confirmed],
          code,
          timeZone: browserTimeZone(),
        },
      });
      await onSigned(signed.signedAt);
    } catch (failure) {
      setError(errorMessage(failure));
      setIsSigning(false);
    }
  }
  return { code, setCode, error, setError, isSigning, sign };
}

/** The two steps of signing: tick every line and get the code, then type it. */
export function useContractSigning(
  contract: ContractDocument,
  onSigned: (signedAt: string) => Promise<void>,
) {
  const summary = useSummaryChoice(contract);
  const request = useCodeRequest(contract, summary.confirmed);
  const entry = useCodeEntry(contract, summary.confirmed, onSigned);
  const [step, setStep] = useState<"summary" | "code">("summary");
  const [summaryError, setSummaryError] = useState<string | null>(null);

  async function submitSummary() {
    const missing = summary.missingMessage();
    if (missing !== null) {
      setSummaryError(missing);
      return;
    }
    if (await request.send(setSummaryError)) {
      entry.setCode("");
      entry.setError(null);
      setStep("code");
    }
  }

  async function resend() {
    if (await request.send(entry.setError)) {
      entry.setCode("");
    }
  }

  return {
    step,
    summary,
    summaryError,
    request,
    entry,
    submitSummary,
    resend,
    backToSummary: () => setStep("summary"),
  };
}
