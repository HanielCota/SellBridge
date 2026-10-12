import {
  createTicketSchema,
  newTicketSearchSchema,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  type TicketCategory,
} from "@sellbridge/shared/schemas";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ChatCircleDotsIcon,
  ClockIcon,
  CreditCardIcon,
  type Icon,
  MegaphoneIcon,
  PackageIcon,
  PlugsConnectedIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { TextField } from "@/components/form/form-field";
import { TextareaField } from "@/components/form/textarea-field";
import { PageHeader } from "@/components/layout/page-header";
import { AttachmentInput } from "@/components/support/attachment-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { responseTargetText } from "@/features/support/response-time";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/suporte/novo")({
  validateSearch: newTicketSearchSchema,
  head: () => ({ meta: [{ title: "Novo chamado | SellBridge" }] }),
  component: NewTicketPage,
});

const createdSchema = z.object({ ticketId: z.uuid() });
const textFieldsSchema = createTicketSchema.omit({ category: true });
const categorySchema = createTicketSchema.shape.category;

function categoryMessage(error: z.ZodError): string {
  return error.issues.at(0)?.message ?? "Escolha sobre o que é o chamado";
}

const CATEGORY_ICONS: Record<TicketCategory, Icon> = {
  order: PackageIcon,
  payment: CreditCardIcon,
  store: PlugsConnectedIcon,
  listing: MegaphoneIcon,
  account: UserCircleIcon,
  other: ChatCircleDotsIcon,
};

interface NewTicketValues {
  subject: string;
  body: string;
}

function buildTicketFormData(
  category: TicketCategory,
  value: NewTicketValues,
  files: readonly File[],
): FormData {
  const formData = new FormData();
  formData.set("category", category);
  formData.set("subject", value.subject);
  formData.set("body", value.body);
  for (const file of files) {
    formData.append("files", file);
  }
  return formData;
}

function useNewTicketForm(files: readonly File[]) {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [category, setCategory] = useState<TicketCategory | null>(search.categoria ?? null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { subject: search.assunto ?? "", body: "" },
    validators: { onSubmit: textFieldsSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const chosen = categorySchema.safeParse(category);
      if (!chosen.success) {
        setCategoryError(categoryMessage(chosen.error));
        return;
      }
      try {
        const response = await postMultipart(
          "/api/suporte/chamados",
          buildTicketFormData(chosen.data, value, files),
        );
        const created = createdSchema.parse(response);
        toast.success("Chamado aberto. Avisamos quando a equipe responder.");
        await queryClient.invalidateQueries({ queryKey: ["tickets"] });
        await navigate({ to: "/suporte/$ticketId", params: { ticketId: created.ticketId } });
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
    },
  });

  function chooseCategory(next: TicketCategory) {
    setCategory(next);
    setCategoryError(null);
  }

  /** Flags a missing subject choice together with the text errors, not only after them. */
  async function submit() {
    const chosen = categorySchema.safeParse(category);
    if (!chosen.success) {
      setCategoryError(categoryMessage(chosen.error));
    }
    await form.handleSubmit();
  }

  return { form, submit, submitError, category, chooseCategory, categoryError };
}

function BackToSupportLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
      <Link to="/suporte">
        <ArrowLeftIcon aria-hidden="true" />
        Suporte
      </Link>
    </Button>
  );
}

/** One card per subject: picking it routes the ticket to the right person on the team. */
function CategoryPicker({
  value,
  error,
  onChange,
}: {
  value: TicketCategory | null;
  error: string | null;
  onChange: (category: TicketCategory) => void;
}) {
  return (
    <fieldset className="grid gap-2" aria-describedby={error ? "category-error" : undefined}>
      <legend className="mb-2 text-sm font-medium">Sobre o que é?</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TICKET_CATEGORIES.map((category) => {
          const CategoryIcon = CATEGORY_ICONS[category];
          const checked = value === category;
          return (
            <label
              key={category}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-sm transition-[background-color,border-color,scale] duration-150 select-none active:scale-[0.98] active:duration-100 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40 motion-reduce:active:scale-100",
                checked
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="category"
                value={category}
                checked={checked}
                onChange={() => onChange(category)}
                className="sr-only"
              />
              <CategoryIcon className="size-4 shrink-0" aria-hidden="true" />
              {TICKET_CATEGORY_LABELS[category]}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id="category-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function NewTicketForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const { form, submit, submitError, category, chooseCategory, categoryError } =
    useNewTicketForm(files);

  return (
    <form noValidate className="grid gap-5" onSubmit={submitHandler(submit)}>
      <FormErrorAlert message={submitError} />
      <CategoryPicker value={category} error={categoryError} onChange={chooseCategory} />
      <form.Field name="subject">
        {(field) => <TextField id="subject" label="Assunto" {...fieldBindings(field)} />}
      </form.Field>
      <form.Field name="body">
        {(field) => (
          <TextareaField id="body" label="Descrição" rows={6} {...fieldBindings(field)} />
        )}
      </form.Field>
      <AttachmentInput files={files} onChange={setFiles} error={fileError} onError={setFileError} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ClockIcon className="size-4 shrink-0" aria-hidden="true" />
          {responseTargetText("normal")}. Avisamos por e-mail.
        </p>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <PendingSubmitButton
              isPending={isSubmitting}
              idleLabel="Abrir chamado"
              pendingLabel="Enviando..."
            />
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

function NewTicketPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <BackToSupportLink />
      <PageHeader
        title="Novo chamado"
        description="Conte o que aconteceu e anexe prints ou comprovantes."
      />
      <Card>
        <CardContent>
          <NewTicketForm />
        </CardContent>
      </Card>
    </div>
  );
}
