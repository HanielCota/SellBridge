import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { problemListFooter } from "./problem-list";

interface Row {
  id: string;
  message: string;
}

const columnHelper = createServerColumnHelper<Row>();
const columns = columnHelper.columns([columnHelper.accessor("message", { header: "Problema" })]);

function tableWith(hasNextPage: boolean): string {
  const footer = problemListFooter({
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage: async () => null,
  });
  return renderToStaticMarkup(
    <DataTable
      columns={columns}
      data={[{ id: "1", message: "Pagamento em dobro ao fornecedor" }]}
      getRowId={(row) => row.id}
      caption="Problemas registrados"
      footer={footer}
    />,
  );
}

function dividerCount(markup: string): number {
  return markup.match(/border-t\b/g)?.length ?? 0;
}

describe("problem list footer", () => {
  it("leaves no empty strip under the last problem when nothing older remains", () => {
    const markup = tableWith(false);

    expect(markup).not.toContain("Mostrar mais antigos");
    expect(dividerCount(markup)).toBe(0);
  });

  it("offers older problems under a single divider", () => {
    const markup = tableWith(true);

    expect(markup).toContain("Mostrar mais antigos");
    expect(dividerCount(markup)).toBe(1);
  });
});
