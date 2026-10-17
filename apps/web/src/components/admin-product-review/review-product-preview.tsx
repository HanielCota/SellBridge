import type { ProductAwaitingReview } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import type { ReactNode } from "react";
import { ProductVisual } from "@/components/catalog/product-visual";
import { SectionCard } from "@/components/layout/section-card";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-footnote text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ImageStrip({ product }: { product: ProductAwaitingReview }) {
  if (product.imageUrls.length === 0) {
    return (
      <ProductVisual
        imageUrl={null}
        title={product.title}
        categoryName={product.categoryName}
        className="aspect-[4/3] w-full rounded-2xl md:aspect-square"
      />
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Imagens do produto">
      {product.imageUrls.map((url, index) => (
        <li key={url} className={index === 0 ? "col-span-3 sm:col-span-4" : undefined}>
          <a href={url} target="_blank" rel="noreferrer noopener" className="block">
            <img
              src={url}
              alt={index === 0 ? `Imagem principal de ${product.title}` : `Imagem ${index + 1}`}
              loading="lazy"
              className="aspect-square w-full rounded-2xl bg-muted object-contain"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Attributes({ attributes }: { attributes: Record<string, string> }) {
  const entries = Object.entries(attributes);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum atributo informado.</p>;
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <Detail key={key} label={key}>
          {value}
        </Detail>
      ))}
    </dl>
  );
}

/** The product as resellers would find it in the catalog, plus what only the platform sees. */
export function ReviewProductPreview({ product }: { product: ProductAwaitingReview }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Como o revendedor vai ver">
        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ImageStrip product={product} />
          <div className="min-w-0 space-y-4">
            <div className="space-y-1">
              <p className="text-footnote text-muted-foreground">
                {product.categoryName ?? "Sem categoria"}
              </p>
              <h2 className="text-xl font-semibold tracking-tight break-words">
                {product.title.length > 0 ? product.title : "Sem título"}
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Detail label="Custo">
                <span className="font-semibold tabular-nums">{formatCents(product.costCents)}</span>
              </Detail>
              <Detail label="Preço sugerido">
                <span className="tabular-nums">{formatCents(product.suggestedPriceCents)}</span>
              </Detail>
              <Detail label="Estoque">{product.stock} un.</Detail>
            </dl>
            <p className="text-sm whitespace-pre-line break-words text-muted-foreground">
              {product.description.length > 0 ? product.description : "Sem descrição."}
            </p>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Ficha técnica" description="Atributos que vão para o Mercado Livre.">
        <Attributes attributes={product.mercadoLivreAttributes} />
      </SectionCard>
    </div>
  );
}
