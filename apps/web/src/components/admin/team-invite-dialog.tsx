import { inviteTeamMemberSchema } from "@sellbridge/shared/schemas";
import { STAFF_ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@sellbridge/shared/staff-access";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/data/segmented-control";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminInviteTeamMember } from "@/features/admin/team.functions";
import { errorMessage } from "@/lib/errors";
import { STAFF_ROLE_HINTS } from "@/components/icons/action-icons";

interface InviteValues {
  name: string;
  email: string;
  role: StaffRole;
}

const EMPTY: InviteValues = { name: "", email: "", role: "agent" };

function fieldErrors(values: InviteValues): Record<string, string[]> {
  const parsed = inviteTeamMemberSchema.safeParse(values);
  if (parsed.success) {
    return {};
  }
  const errors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    errors[field] = [...(errors[field] ?? []), issue.message];
  }
  return errors;
}

function useInvite(onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: InviteValues) => adminInviteTeamMember({ data: values }),
    onSuccess: async (result) => {
      toast.success(
        result.status === "invited"
          ? "Convite enviado. A pessoa cria a senha pelo e-mail."
          : "Cargo definido. A pessoa já pode entrar na área da equipe.",
      );
      await queryClient.invalidateQueries({ queryKey: ["team"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      onDone();
    },
  });
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<InviteValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const invite = useInvite(onClose);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issues = fieldErrors(values);
    setErrors(issues);
    if (Object.keys(issues).length === 0) {
      invite.mutate(values);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="grid gap-5">
      <FormErrorAlert message={invite.isError ? errorMessage(invite.error) : null} />
      <TextField
        id="invite-name"
        label="Nome"
        autoComplete="off"
        value={values.name}
        errors={errors.name ?? []}
        onValueChange={(name) => setValues((current) => ({ ...current, name }))}
      />
      <TextField
        id="invite-email"
        label="E-mail"
        type="email"
        autoComplete="off"
        value={values.email}
        errors={errors.email ?? []}
        onValueChange={(email) => setValues((current) => ({ ...current, email }))}
      />
      <div className="grid gap-2">
        <SegmentedControl
          legend="Cargo"
          options={STAFF_ROLES}
          labels={STAFF_ROLE_LABELS}
          value={values.role}
          onChange={(role) => setValues((current) => ({ ...current, role }))}
        />
        <p className="text-sm text-muted-foreground">{STAFF_ROLE_HINTS[values.role]}.</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={invite.isPending}>
          {invite.isPending ? "Enviando…" : "Enviar convite"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Brings a person into the team with a role; new addresses get a link to create the password. */
export function TeamInviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-5 rounded-[1.75rem] p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convidar para a equipe</DialogTitle>
          <DialogDescription>
            Quem ainda não tem conta recebe um e-mail para criar a senha. Quem já tem conta passa a
            ter o cargo na hora.
          </DialogDescription>
        </DialogHeader>
        {open ? <InviteForm onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}
