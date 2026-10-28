import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { BrandForm } from "@/components/supplier-panel/brand/brand-form";
import { getOwnBrandFn } from "@/features/supplier-panel/brand/brand.functions";

export const Route = createFileRoute("/_app/fornecedor/painel/marca")({
  loader: async () => getOwnBrandFn(),
  head: () => ({ meta: [{ title: "Marca | Painel do fornecedor" }] }),
  component: SupplierBrandPage,
});

function SupplierBrandPage() {
  const { brand, loginEmail, categoryNames } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <div className="w-full">
      <BrandForm
        key={brand?.id ?? "new"}
        brand={brand}
        loginEmail={loginEmail}
        categoryNames={categoryNames}
        onSaved={async () => {
          await router.invalidate();
          // A new brand goes on to its first product; an edit stays on the page.
          if (brand === null) {
            await navigate({ to: "/fornecedor/painel/produtos" });
          }
        }}
      />
    </div>
  );
}
