import type { TicketFollower } from "@sellbridge/database/repositories";
import type { TicketCategory } from "@sellbridge/shared/schemas";
import { ticketCode } from "@sellbridge/shared/ticket-rules";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BellIcon,
  CopySimpleIcon,
  DotsThreeIcon,
  LinkIcon,
  PrinterIcon,
  UserPlusIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addMyTicketFollower,
  setMyTicketNotifications,
} from "@/features/support/support.functions";
import { myColleaguesQueryOptions } from "@/features/support/support.queries";
import { copyToClipboard } from "@/lib/clipboard";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

interface MenuTicket {
  id: string;
  subject: string;
  category: TicketCategory;
}

function useNotifications(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notify: boolean) => setMyTicketNotifications({ data: { ticketId, notify } }),
    onSuccess: async (_result, notify) => {
      toast.success(
        notify ? "Você volta a receber os e-mails" : "E-mails deste chamado desligados",
      );
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function ColleagueOptions({
  following,
  selected,
  onSelect,
}: {
  following: ReadonlySet<string>;
  selected: string | null;
  onSelect: (userId: string) => void;
}) {
  const colleagues = useQuery(myColleaguesQueryOptions());
  if (colleagues.isPending) {
    return <Skeleton className="h-24 rounded-2xl" aria-label="Carregando equipe" />;
  }
  if (colleagues.isError) {
    return <FormErrorAlert message={errorMessage(colleagues.error)} />;
  }
  const available = colleagues.data.filter((person) => !following.has(person.userId));
  if (available.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todo mundo da sua equipe já acompanha este chamado.
      </p>
    );
  }
  return (
    <fieldset className="max-h-64 space-y-1 overflow-y-auto">
      <legend className="sr-only">Equipe</legend>
      {available.map((person) => (
        <label
          key={person.userId}
          className={cn(
            "block cursor-pointer rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-muted has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40",
            selected === person.userId && "border-brand-strong bg-brand/5",
          )}
        >
          <input
            type="radio"
            name="colleague"
            value={person.userId}
            checked={selected === person.userId}
            className="sr-only"
            onChange={() => onSelect(person.userId)}
          />
          <span className="block font-medium">{person.name}</span>
          <span className="block text-xs text-muted-foreground">{person.email}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** The chosen colleague and the add request; every way out starts the next opening clean. */
function useAddColleague(ticketId: string, onOpenChange: (open: boolean) => void) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: (userId: string) => addMyTicketFollower({ data: { ticketId, userId } }),
    onSuccess: async () => {
      toast.success("Colega adicionado ao chamado");
      close();
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  function close() {
    setSelected(null);
    add.reset();
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    close();
  }

  return { selected, setSelected, add, close, handleOpenChange };
}

function AddColleagueDialog({
  ticketId,
  followers,
  open,
  onOpenChange,
}: {
  ticketId: string;
  followers: readonly TicketFollower[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { selected, setSelected, add, close, handleOpenChange } = useAddColleague(
    ticketId,
    onOpenChange,
  );
  const following = new Set(
    followers.filter((follower) => follower.notify).map((follower) => follower.userId),
  );
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar colega da loja</DialogTitle>
          <DialogDescription>
            Quem você escolher recebe um e-mail sempre que o suporte responder.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ColleagueOptions following={following} selected={selected} onSelect={setSelected} />
        ) : null}
        <FormErrorAlert message={add.error ? errorMessage(add.error) : null} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={selected === null || add.isPending}
            aria-busy={add.isPending}
            onClick={() => {
              if (selected === null) {
                return;
              }
              add.mutate(selected);
            }}
          >
            {add.isPending ? "Adicionando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MenuItems({
  ticket,
  notifyMe,
  onAddColleague,
}: {
  ticket: MenuTicket;
  notifyMe: boolean;
  onAddColleague: () => void;
}) {
  const notifications = useNotifications(ticket.id);
  const code = ticketCode(ticket.id);
  return (
    <DropdownMenuContent align="end" className="w-72">
      <DropdownMenuItem
        onSelect={() => void copyToClipboard(window.location.href, "Link do chamado copiado")}
      >
        <LinkIcon aria-hidden="true" />
        Copiar link
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => window.print()}>
        <PrinterIcon aria-hidden="true" />
        Imprimir ou salvar em PDF
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={notifyMe}
        disabled={notifications.isPending}
        onCheckedChange={(checked) => notifications.mutate(checked)}
      >
        <BellIcon aria-hidden="true" />
        Receber respostas por e-mail
      </DropdownMenuCheckboxItem>
      <DropdownMenuItem onSelect={onAddColleague}>
        <UserPlusIcon aria-hidden="true" />
        Adicionar colega da loja
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link
          to="/suporte/novo"
          search={{ categoria: ticket.category, assunto: `Sobre o chamado #${code}` }}
        >
          <CopySimpleIcon aria-hidden="true" />
          Abrir chamado relacionado
        </Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** The "…" menu of the ticket: share, print, e-mails and related tickets. */
export function TicketActionsMenu({
  ticket,
  followers,
  notifyMe,
}: {
  ticket: MenuTicket;
  followers: readonly TicketFollower[];
  notifyMe: boolean;
}) {
  const [addingColleague, setAddingColleague] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Mais ações do chamado"
            className="print:hidden"
          >
            <DotsThreeIcon weight="bold" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <MenuItems
          ticket={ticket}
          notifyMe={notifyMe}
          onAddColleague={() => setAddingColleague(true)}
        />
      </DropdownMenu>
      <AddColleagueDialog
        ticketId={ticket.id}
        followers={followers}
        open={addingColleague}
        onOpenChange={setAddingColleague}
      />
    </>
  );
}
