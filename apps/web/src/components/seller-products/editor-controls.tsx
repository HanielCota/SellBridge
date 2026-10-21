import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SellerProductEditor } from "@/features/seller-products/use-product-editor";
import type { EditorActions } from "@/features/seller-products/use-editor-actions";
import { errorMessage } from "@/lib/errors";

export function productStatus(
  product: { active: boolean; reviewStatus: string },
  origin: "seller" | "supplier" = "seller",
) {
  if (product.reviewStatus === "rejected") return origin === "seller" ? "Bloqueado" : "Reprovado";
  if (!product.active) return "Arquivado";
  if (product.reviewStatus === "in_review") return "Em análise";
  return product.reviewStatus === "approved"
    ? origin === "seller"
      ? "Pronto para publicar"
      : "Aprovado"
    : "Rascunho";
}

interface ControlsProps {
  form: SellerProductEditor;
  action: EditorActions;
  settled: boolean;
}

function CustomerControls({ form, action, settled }: ControlsProps) {
  const [newSku, setNewSku] = useState("");
  return (
    <>
      <PublishCatalogLink form={form} settled={settled} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="duplicate-sku">Código do produto duplicado (SKU)</Label>
          <Input
            id="duplicate-sku"
            value={newSku}
            onChange={(event) => setNewSku(event.target.value)}
            maxLength={100}
          />
        </div>
        <Button
          variant="outline"
          disabled={!settled || newSku.trim() === "" || form.saved?.reviewStatus === "rejected"}
          onClick={() =>
            action.mutate({ kind: "duplicate", newSku, newProductId: crypto.randomUUID() })
          }
        >
          Duplicar como rascunho
        </Button>
      </div>
    </>
  );
}

export function EditorControls({
  form,
  action,
  settled,
  admin,
}: ControlsProps & { admin: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="outline"
        disabled={!form.canSave || action.isPending || form.state.kind === "conflict"}
        onClick={() => void form.save()}
      >
        Salvar agora
      </Button>
      <Button
        disabled={!settled || !form.report.canSubmit || form.saved?.reviewStatus === "rejected"}
        onClick={() => action.mutate({ kind: "activate" })}
      >
        Deixar pronto para publicar
      </Button>
      <Button
        variant="outline"
        disabled={!settled}
        onClick={() => action.mutate({ kind: "archive" })}
      >
        Arquivar produto
      </Button>
      {admin ? (
        <>
          <Button
            variant="outline"
            disabled={!settled}
            onClick={() => action.mutate({ kind: "block" })}
          >
            Bloquear produto
          </Button>
          <Button
            variant="outline"
            disabled={!settled || form.saved?.reviewStatus !== "rejected"}
            onClick={() => action.mutate({ kind: "unblock" })}
          >
            Remover bloqueio
          </Button>
        </>
      ) : (
        <CustomerControls form={form} action={action} settled={settled} />
      )}
      {action.isError ? (
        <p role="alert" className="text-destructive">
          {errorMessage(action.error)}
        </p>
      ) : null}
    </div>
  );
}

function saveStatus(form: SellerProductEditor) {
  if (!form.canSave) return "Informe o motivo antes de salvar as alterações.";
  if (form.state.kind === "saving") return "Salvando…";
  if (form.state.kind === "saved" && !form.dirty) return "Todas as alterações foram salvas";
  if (form.state.kind === "needs-sku") return "Informe um código (SKU) para começar a salvar.";
  return form.dirty ? "Alterações não salvas" : "Nenhuma alteração pendente";
}

export function EditorFeedback({ form }: { form: SellerProductEditor }) {
  return (
    <div className="space-y-3">
      <output aria-live="polite">{saveStatus(form)}</output>
      {form.state.kind === "error" || form.state.kind === "conflict" ? (
        <p role="alert" className="text-destructive">
          {form.state.message}
        </p>
      ) : null}
      {form.state.kind === "invalid" ? (
        <div role="alert">
          {Object.entries(form.state.errors).map(([field, message]) => (
            <p key={field}>{message}</p>
          ))}
        </div>
      ) : null}
      {form.saved?.reviewStatus === "rejected" ? (
        <div role="alert">
          {form.saved.rejectionReasons.map((reason) => (
            <p key={`${reason.field}-${reason.rule}`}>{reason.message}</p>
          ))}
        </div>
      ) : null}
      {form.report.blocking.length > 0 ? (
        <aside className="rounded-xl bg-muted p-4">
          <h2 className="font-medium">Antes de publicar</h2>
          <ul className="list-inside list-disc">
            {form.report.blocking.map((issue) => (
              <li key={issue.rule}>{issue.message}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

function PublishCatalogLink({ form, settled }: Pick<ControlsProps, "form" | "settled">) {
  if (!settled || form.saved?.reviewStatus !== "approved" || !form.saved.active)
    return (
      <Button variant="secondary" disabled>
        Publicar produto
      </Button>
    );
  return (
    <Button asChild variant="secondary">
      <Link to="/publicacoes/nova" search={{ productId: form.saved.id }}>
        Publicar produto
      </Link>
    </Button>
  );
}
