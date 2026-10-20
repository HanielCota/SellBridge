import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/feedback/error-state";
import {
  adminSellerProductFormFn,
  sellerProductFormFn,
} from "@/features/seller-products/products.functions";
import {
  useSellerProductEditor,
  type SellerProductEditor,
  type SellerProductFormData,
} from "@/features/seller-products/use-product-editor";
import { useEditorActions } from "@/features/seller-products/use-editor-actions";
import { errorMessage } from "@/lib/errors";
import { ProductFields } from "./product-fields";
import { ProductImages } from "./product-images";
import { AdminProductHistory } from "./product-history";
import { EditorControls, EditorFeedback, productStatus } from "./editor-controls";

interface EditorProps {
  productId: string;
  adminTenantId?: string | undefined;
  onBack: () => void;
  onOpen: (id: string) => void;
}

export function ProductEditor(props: EditorProps) {
  const [revision, setRevision] = useState(0);
  const query = useQuery({
    queryKey: ["seller-products", "form", props.adminTenantId ?? "self", props.productId],
    queryFn: () =>
      props.adminTenantId === undefined
        ? sellerProductFormFn({ data: { productId: props.productId } })
        : adminSellerProductFormFn({
            data: { tenantId: props.adminTenantId, productId: props.productId },
          }),
  });
  if (query.isPending) return <output>Carregando produto…</output>;
  if (query.isError)
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return (
    <LoadedEditor
      key={`${props.productId}-${revision}`}
      {...props}
      data={query.data}
      onChanged={async () => {
        await query.refetch();
        setRevision((value) => value + 1);
      }}
    />
  );
}

function InterventionReason({
  reason,
  onChange,
}: {
  reason: string;
  onChange: (reason: string) => void;
}) {
  return (
    <div className="surface-card space-y-2 rounded-2xl bg-card p-5">
      <Label htmlFor="product-admin-reason">Motivo da alteração administrativa</Label>
      <Input
        id="product-admin-reason"
        value={reason}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Explique a correção ou ação realizada"
      />
      <p className="text-sm text-muted-foreground">
        Cada alteração salva e cada ação registra sua identificação e este motivo.
      </p>
    </div>
  );
}

function LoadedEditor({
  data,
  onChanged,
  ...props
}: EditorProps & { data: SellerProductFormData; onChanged: () => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const form = useSellerProductEditor({
    data,
    productId: props.productId,
    adminTenantId: props.adminTenantId,
    busy: uploading,
  });
  const action = useEditorActions({ ...props, onChanged }, form);
  const settled = form.saved !== null && !form.dirty && form.canSave && !action.isPending;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <EditorHeader form={form} onBack={props.onBack} />
      {props.adminTenantId === undefined ? null : (
        <InterventionReason reason={form.reason} onChange={form.setReason} />
      )}
      <section className="surface-card space-y-6 rounded-3xl bg-card p-6">
        <fieldset disabled={action.isPending} className="space-y-8">
          <ProductFields
            values={form.values}
            onChange={form.change}
            categories={data.categories}
            required={form.required}
            reservedStock={form.saved?.reservedStock ?? 0}
          />
          <ProductImages
            images={form.values.imageUrls}
            onChange={(imageUrls) => form.change({ imageUrls })}
            onBusy={setUploading}
            adminTenantId={props.adminTenantId}
            reason={form.reason}
            disabled={!form.canSave || action.isPending}
          />
        </fieldset>
        <EditorFeedback form={form} />
        <EditorControls
          form={form}
          action={action}
          settled={settled}
          admin={props.adminTenantId !== undefined}
        />
      </section>
      {props.adminTenantId === undefined || form.saved === null ? null : (
        <AdminProductHistory
          tenantId={props.adminTenantId}
          productId={props.productId}
          reason={form.reason}
          canAct={settled}
        />
      )}
    </div>
  );
}

function EditorHeader({ form, onBack }: { form: SellerProductEditor; onBack: () => void }) {
  return (
    <PageHeader
      title={form.saved === null ? "Novo produto" : form.values.title || "Editar produto"}
      description="Seu estoque particular. Cadastrar um produto não cria um anúncio no marketplace."
      back={
        <Button
          variant="ghost"
          onClick={() => {
            if (form.canDiscard()) onBack();
          }}
        >
          Voltar aos produtos
        </Button>
      }
      actions={form.saved ? <span>{productStatus(form.saved)}</span> : undefined}
    />
  );
}
