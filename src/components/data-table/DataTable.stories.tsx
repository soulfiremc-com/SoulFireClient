import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import { SettingsIcon, TextIcon } from "lucide-react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { expect, waitFor, within } from "storybook/test";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableActionBar,
  DataTableActionBarSelection,
} from "@/components/data-table/data-table-action-bar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import {
  SelectAllHeader,
  SelectRowHeader,
} from "@/components/data-table/data-table-selects";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDataTable } from "@/hooks/use-data-table";
import type { dataTableFeatures } from "@/lib/data-table-features";

interface DemoAccount {
  id: string;
  type: "online" | "offline";
  name: string;
  address: string;
}

const ROW_COUNT = 2000;

const rows: DemoAccount[] = Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: `account-${index}`,
  type: index % 3 === 0 ? "offline" : "online",
  name: `Bot_${String(index).padStart(4, "0")}`,
  address: `10.0.${Math.floor(index / 256)}.${index % 256}:25565`,
}));

const columns: ColumnDef<typeof dataTableFeatures, DemoAccount>[] = [
  {
    id: "select",
    header: SelectAllHeader,
    cell: SelectRowHeader,
    size: 32,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "type",
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Type" />
    ),
    cell: ({ cell }) => (
      <Badge variant="outline">{cell.getValue<string>()}</Badge>
    ),
    meta: {
      label: "Type",
      variant: "multiSelect",
      options: [
        { label: "Online", value: "online" },
        { label: "Offline", value: "offline" },
      ],
    },
    filterFn: "arrHas",
    enableColumnFilter: true,
  },
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Name" />
    ),
    meta: {
      label: "Name",
      placeholder: "Search names...",
      variant: "text",
      icon: TextIcon,
    },
    enableColumnFilter: true,
  },
  {
    id: "address",
    accessorKey: "address",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Address" />
    ),
    meta: { label: "Address" },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: () => (
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="ghost" size="icon" className="size-8" />}
        >
          <SettingsIcon className="size-4" />
          <span className="sr-only">Open settings</span>
        </TooltipTrigger>
        <TooltipContent>Open settings</TooltipContent>
      </Tooltip>
    ),
    size: 48,
    enableSorting: false,
    enableHiding: false,
  },
];

function LargeTable() {
  const { table } = useDataTable({
    data: rows,
    columns,
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
    getRowId: (row) => row.id,
  });

  return (
    <DataTable
      table={table}
      actionBar={
        <DataTableActionBar table={table}>
          <DataTableActionBarSelection table={table} />
        </DataTableActionBar>
      }
    >
      <DataTableToolbar table={table} />
    </DataTable>
  );
}

const meta = {
  title: "Data table/Large table",
  component: LargeTable,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <NuqsTestingAdapter>
        <div className="p-4">
          <Story />
        </div>
      </NuqsTestingAdapter>
    ),
  ],
} satisfies Meta<typeof LargeTable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SelectAndFilter: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const rowCheckboxes = await canvas.findAllByRole("checkbox", {
      name: "Select row",
    });
    await expect(rowCheckboxes).toHaveLength(50);

    const [, secondRow] = rowCheckboxes;
    if (!secondRow) throw new Error("The table did not render a second row");
    await userEvent.click(secondRow);
    await expect(secondRow).toBeChecked();
    await expect(
      canvas.getByText(`1 of ${ROW_COUNT} row(s) selected`),
    ).toBeVisible();
    await waitFor(() => expect(body.getByText("1 selected")).toBeVisible());

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Name" }),
      "Bot_1999",
    );
    await waitFor(() =>
      expect(
        canvas.getAllByRole("checkbox", { name: "Select row" }),
      ).toHaveLength(1),
    );
    await expect(canvas.getByText("Bot_1999")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Reset filters" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("textbox", { name: "Name" })).toHaveValue(""),
    );
  },
};
