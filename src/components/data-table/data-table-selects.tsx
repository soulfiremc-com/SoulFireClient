import type {
  CellContext,
  HeaderContext,
  RowData,
} from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import type { dataTableFeatures } from "@/lib/data-table-features";

export function SelectAllHeader<T extends RowData>({
  table,
}: HeaderContext<typeof dataTableFeatures, T>) {
  const { t } = useTranslation("common");
  return (
    <div className="flex">
      <Checkbox
        className="my-auto"
        checked={table.getIsAllRowsSelected()}
        indeterminate={
          !table.getIsAllRowsSelected() && table.getIsSomeRowsSelected()
        }
        onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
        aria-label={t("dataTable.selectAll")}
      />
    </div>
  );
}

export function SelectRowHeader<T extends RowData>({
  row,
}: CellContext<typeof dataTableFeatures, T>) {
  const { t } = useTranslation("common");
  return (
    <div className="flex">
      <Checkbox
        className="my-auto"
        disabled={!row.getCanSelect()}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={t("dataTable.selectRow")}
      />
    </div>
  );
}
