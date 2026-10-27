import type { TicketStatus } from "@sellbridge/shared/schemas";
import { CaretDownIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert } from "@/components/form/form-feedback";
import {
  AttachedFiles,
  AttachmentButton,
  COMPOSER_BOX_CLASS,
  COMPOSER_TEXTAREA_CLASS,
  COMPOSER_TOOLBAR_CLASS,
  FileError,
  submitOnModEnter,
  useComposerFiles,
} from "@/components/support/composer-parts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ComposerModeSwitch, type ComposerMode } from "@/components/support/composer-mode-switch";
import { TemplateMenu } from "@/components/support/template-menu";
import { ClosedNotice } from "@/components/support/closed-notice";
import {
  fillTemplate,
  insertAt,
  type ReplyTemplate,
  type TemplateContext,
} from "@/features/support/reply-templates";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export type { ComposerMode };

/** Lets the thread push text (a quote) into the composer at the admin's caret. */
export interface ComposerHandle {
  insert: (text: string) => void;
}

const MAX_BODY_LENGTH = 5000;
/** The counter only shows up when the limit starts to matter. */
const COUNTER_THRESHOLD = 4000;
const MIN_BODY_LENGTH: Record<ComposerMode, number> = { reply: 10, note: 2 };

const SEND_OPTIONS: readonly { value: TicketStatus; menuLabel: string; buttonLabel: string }[] = [
  { value: "answered", menuLabel: "Enviar e marcar respondido", buttonLabel: "Enviar ao cliente" },
  { value: "open", menuLabel: "Enviar e manter aguardando", buttonLabel: "Enviar e aguardar" },
  { value: "closed", menuLabel: "Enviar e encerrar", buttonLabel: "Enviar e encerrar" },
];

const countFormatter = new Intl.NumberFormat("pt-BR");

interface AdminComposerProps {
  ticketId: string;
  isClosed: boolean;
  /** Ready answers that fit who opened the ticket (see `replyTemplatesFor`). */
  templates: readonly ReplyTemplate[];
  templateContext: TemplateContext;
  isChangingStatus: boolean;
  onChangeStatus: (status: "open" | "closed") => void;
  onSent: (mode: ComposerMode, status: TicketStatus) => Promise<void> | void;
  ref?: Ref<ComposerHandle>;
}

function buildFormData(
  mode: ComposerMode,
  body: string,
  statusAfter: TicketStatus,
  files: readonly File[],
) {
  const formData = new FormData();
  formData.set("kind", mode);
  formData.set("body", body);
  if (mode === "reply") {
    formData.set("statusAfter", statusAfter);
  }
  for (const file of files) {
    formData.append("files", file);
  }
  return formData;
}

function findSendOption(status: unknown) {
  return SEND_OPTIONS.find((option) => option.value === status);
}

function readStatus(result: unknown, fallback: TicketStatus): TicketStatus {
  if (typeof result !== "object" || result === null || !("status" in result)) {
    return fallback;
  }
  return findSendOption(result.status)?.value ?? fallback;
}

/** Keeps the text, the caret, the files and the chosen status of the composer. */
function useComposerState() {
  const [mode, setMode] = useState<ComposerMode>("reply");
  const [body, setBody] = useState("");
  const attachments = useComposerFiles();
  const [statusAfter, setStatusAfter] = useState<TicketStatus>("answered");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The caret survives focus moving to a menu, so a template lands where the admin was typing.
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  function rememberSelection() {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    selectionRef.current = { start: element.selectionStart, end: element.selectionEnd };
  }

  function insert(text: string) {
    const selection = selectionRef.current ?? { start: body.length, end: body.length };
    const next = insertAt(body, text, selection.start, selection.end);
    setBody(next.value);
    selectionRef.current = { start: next.caret, end: next.caret };
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) {
        return;
      }
      element.focus();
      element.setSelectionRange(next.caret, next.caret);
    });
  }

  function reset() {
    setBody("");
    attachments.clear();
    setStatusAfter("answered");
    selectionRef.current = null;
  }

  // The ref travels apart from the state so rendering never reads through an object holding it.
  const state = {
    mode,
    setMode,
    body,
    setBody,
    ...attachments,
    statusAfter,
    setStatusAfter,
    rememberSelection,
    insert,
    reset,
  };
  return [state, textareaRef] as const;
}

type ComposerState = ReturnType<typeof useComposerState>[0];

function SendOptionsMenu({
  state,
  disabled,
  onCloseWithoutReply,
}: {
  state: ComposerState;
  disabled: boolean;
  onCloseWithoutReply: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          aria-label="Opções de envio"
          className="rounded-l-none px-2"
        >
          <CaretDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Status após enviar
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={state.statusAfter}
          onValueChange={(value) => {
            const option = findSendOption(value);
            if (option) {
              state.setStatusAfter(option.value);
            }
          }}
        >
          {SEND_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.menuLabel}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCloseWithoutReply}>Encerrar sem responder</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SendButton({
  state,
  isSending,
  onCloseWithoutReply,
}: {
  state: ComposerState;
  isSending: boolean;
  onCloseWithoutReply: () => void;
}) {
  const busyIcon = isSending ? (
    <CircleNotchIcon className="animate-spin" aria-hidden="true" />
  ) : null;
  if (state.mode === "note") {
    return (
      <Button type="submit" size="sm" disabled={isSending} aria-busy={isSending}>
        {busyIcon}
        {isSending ? "Salvando…" : "Salvar nota"}
      </Button>
    );
  }
  const idleLabel = findSendOption(state.statusAfter)?.buttonLabel ?? "Enviar";
  return (
    <div className="flex items-center gap-px">
      <Button
        type="submit"
        size="sm"
        disabled={isSending}
        aria-busy={isSending}
        title="Ctrl + Enter"
        className="rounded-r-none"
      >
        {busyIcon}
        {isSending ? "Enviando…" : idleLabel}
      </Button>
      <SendOptionsMenu
        state={state}
        disabled={isSending}
        onCloseWithoutReply={onCloseWithoutReply}
      />
    </div>
  );
}

function CharacterCount({ length }: { length: number }) {
  if (length < COUNTER_THRESHOLD) {
    return null;
  }
  const isOver = length > MAX_BODY_LENGTH;
  return (
    <span
      className={cn("text-xs tabular-nums text-muted-foreground", isOver && "text-destructive")}
      aria-live="polite"
    >
      {countFormatter.format(length)}/{countFormatter.format(MAX_BODY_LENGTH)}
    </span>
  );
}

function ComposerToolbar({
  state,
  templates,
  templateContext,
  isSending,
  onCloseWithoutReply,
}: {
  state: ComposerState;
  templates: readonly ReplyTemplate[];
  templateContext: TemplateContext;
  isSending: boolean;
  onCloseWithoutReply: () => void;
}) {
  const isNote = state.mode === "note";

  function pickTemplate(template: ReplyTemplate) {
    state.insert(fillTemplate(template.body, templateContext));
    if (template.statusAfter && !isNote) {
      state.setStatusAfter(template.statusAfter);
    }
  }

  return (
    <div className={COMPOSER_TOOLBAR_CLASS}>
      {isNote ? null : (
        <TemplateMenu templates={templates} context={templateContext} onPick={pickTemplate} />
      )}
      <AttachmentButton onAdd={state.addFiles} />
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <CharacterCount length={state.body.length} />
        <SendButton state={state} isSending={isSending} onCloseWithoutReply={onCloseWithoutReply} />
      </div>
    </div>
  );
}

function ComposerTextarea({
  state,
  textareaRef,
  placeholder,
  onSubmitShortcut,
}: {
  state: ComposerState;
  textareaRef: Ref<HTMLTextAreaElement>;
  placeholder: string;
  onSubmitShortcut: () => void;
}) {
  return (
    <textarea
      ref={textareaRef}
      id="admin-reply-body"
      aria-label={state.mode === "note" ? "Nota para a equipe" : "Resposta do suporte"}
      rows={3}
      placeholder={placeholder}
      value={state.body}
      className={COMPOSER_TEXTAREA_CLASS}
      onChange={(event) => state.setBody(event.target.value)}
      onSelect={state.rememberSelection}
      onKeyUp={state.rememberSelection}
      onKeyDown={(event) => submitOnModEnter(event, onSubmitShortcut)}
    />
  );
}

function validationProblem(mode: ComposerMode, body: string): string | null {
  if (body.length < MIN_BODY_LENGTH[mode]) {
    return mode === "note" ? "Escreva a nota" : "Escreva ao menos 10 caracteres";
  }
  if (body.length > MAX_BODY_LENGTH) {
    return "A mensagem deve ter no máximo 5.000 caracteres";
  }
  return null;
}

function useComposerSubmit(
  ticketId: string,
  state: ComposerState,
  onSent: AdminComposerProps["onSent"],
) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // State updates land after the next render; two quick submits would both see "not sending".
  const sendingRef = useRef(false);

  async function submit() {
    if (sendingRef.current) {
      return;
    }
    const body = state.body.trim();
    const problem = validationProblem(state.mode, body);
    setSubmitError(problem);
    if (problem) {
      return;
    }
    const { mode, statusAfter } = state;
    sendingRef.current = true;
    setIsSending(true);
    try {
      const formData = buildFormData(mode, body, statusAfter, state.files);
      const result = await postMultipart(`/api/admin/chamados/${ticketId}/mensagens`, formData);
      state.reset();
      await onSent(mode, readStatus(result, statusAfter));
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  return { submit, submitError, isSending };
}

function ComposerBox({
  state,
  textareaRef,
  templates,
  templateContext,
  submission,
  onCloseWithoutReply,
}: {
  state: ComposerState;
  textareaRef: Ref<HTMLTextAreaElement>;
  templates: readonly ReplyTemplate[];
  templateContext: TemplateContext;
  submission: ReturnType<typeof useComposerSubmit>;
  onCloseWithoutReply: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const isNote = state.mode === "note";
  return (
    <div className="space-y-2">
      <form
        ref={formRef}
        noValidate
        className={cn(
          COMPOSER_BOX_CLASS,
          isNote && "border-amber-500/50 bg-amber-500/5 focus-within:border-amber-500",
        )}
        onSubmit={submitHandler(submission.submit)}
      >
        <ComposerModeSwitch mode={state.mode} onChange={state.setMode} />
        <ComposerTextarea
          state={state}
          textareaRef={textareaRef}
          placeholder={
            isNote
              ? "Contexto para a equipe: o que foi verificado, próximos passos…"
              : `Responder para ${templateContext.customerName}...`
          }
          onSubmitShortcut={() => formRef.current?.requestSubmit()}
        />
        <AttachedFiles files={state.files} onRemove={state.removeFile} />
        <ComposerToolbar
          state={state}
          templates={templates}
          templateContext={templateContext}
          isSending={submission.isSending}
          onCloseWithoutReply={onCloseWithoutReply}
        />
      </form>
      <FileError message={state.fileError} />
      <FormErrorAlert message={submission.submitError} />
    </div>
  );
}

/**
 * Support composer in a single box: canned replies, attachments and the internal-note switch sit
 * in one icon row, and the send button carries the status the ticket ends up in.
 */
export function AdminComposer({
  ticketId,
  isClosed,
  templates,
  templateContext,
  isChangingStatus,
  onChangeStatus,
  onSent,
  ref,
}: AdminComposerProps) {
  const [state, textareaRef] = useComposerState();
  const submission = useComposerSubmit(ticketId, state, onSent);

  useImperativeHandle(ref, () => ({
    insert: (text) => {
      // A closed ticket only takes notes; the quote went into the hidden reply box before.
      if (isClosed) {
        state.setMode("note");
      }
      state.insert(text);
    },
  }));

  if (isClosed && state.mode === "reply") {
    return (
      <ClosedNotice
        isChangingStatus={isChangingStatus}
        onReopen={() => onChangeStatus("open")}
        onWriteNote={() => state.setMode("note")}
      />
    );
  }
  return (
    <ComposerBox
      state={state}
      textareaRef={textareaRef}
      templates={templates}
      templateContext={templateContext}
      submission={submission}
      onCloseWithoutReply={() => onChangeStatus("closed")}
    />
  );
}
