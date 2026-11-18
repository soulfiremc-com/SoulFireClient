import type {
  CellContext,
  HeaderContext,
  RowData,
} from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import type { dataTableFeatures } from "@/lib/data-table-features";

// The label grows the tap target to 40px without changing the row height.
const HIT_AREA_CLASS_NAME =
  "-my-3 flex h-10 w-9 cursor-pointer items-center has-disabled:cursor-not-allowed";

export function SelectAllHeader<T extends RowData>({
  table,
}: HeaderContext<typeof dataTableFeatures, T>) {
  const { t } = useTranslation("common");
  return (
    <label className={HIT_AREA_CLASS_NAME}>
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        indeterminate={
          !table.getIsAllRowsSelected() && table.getIsSomeRowsSelected()
        }
        onCheckedChange={(value) => table.toggleAllRowsSelected(value)}
        aria-label={t("dataTable.selectAll")}
      />
    </label>
  );
}

export function SelectRowHeader<T extends RowData>({
  row,
}: CellContext<typeof dataTableFeatures, T>) {
  const { t } = useTranslation("common");
  return (
    <label className={HIT_AREA_CLASS_NAME}>
      <Checkbox
        disabled={!row.getCanSelect()}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(value)}
        aria-label={t("dataTable.selectRow")}
      />
    </label>
  );
}
