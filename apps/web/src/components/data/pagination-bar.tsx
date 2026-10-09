import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}

export function PaginationBar({
  page,
  totalPages,
  total,
  itemLabel,
  onPageChange,
}: PaginationBarProps) {
  if (total === 0) {
    return null;
  }
  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row"
    >
      <p className="text-muted-foreground">
        {total} {itemLabel} · página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <CaretLeftIcon aria-hidden="true" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
          <CaretRightIcon aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
