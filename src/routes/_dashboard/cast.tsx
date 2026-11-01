import {
  CastDevice,
  DEFAULT_SETTINGS,
  DisplaySettings,
  STALE_AFTER_MS,
  type CastDeviceState,
} from "@soulfiremc/cast-protocol";
import { useForm } from "@tanstack/react-form";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useDebouncedCallback, useDebouncedValue } from "@tanstack/react-pacer";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import {
  type ColumnDef,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Schema } from "effect";
import { ArrowLeftIcon, CastIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { castClient, castStore } from "@/lib/cast-client";
import { isDesktopApp } from "@/lib/desktop";
import i18n from "@/lib/i18n";
import { staticRouteTitle } from "@/lib/route-title";
import { getCastSource } from "@/lib/web-rpc";

const Search = Schema.Struct({ instance: Schema.optional(Schema.String) });
export const Route = createFileRoute("/_dashboard/cast")({
  validateSearch: Schema.decodeUnknownSync(Search),
  beforeLoad: () => staticRouteTitle(() => i18n.t("cast:title")),
  component: CastPage,
});
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

function DeviceActions({
  device,
  selected,
}: {
  device: CastDeviceState;
  selected: string | undefined;
}) {
  const { t } = useTranslation("cast");
  const connect = useMutation({
    mutationFn: ({
      instanceId,
      show,
    }: {
      instanceId: string;
      show: boolean;
    }) => {
      const source = getCastSource(instanceId);
      if (!source) return Promise.reject(new Error(t("serverRequired")));
      return castClient.connect(device, source, show);
    },
    retry: false,
  });
  const stop = useMutation({
    mutationFn: () => castClient.stop(device.id),
    retry: false,
  });
  const active = ["connecting", "ready", "reconnecting"].includes(device.phase);
  const instanceId = device.instanceId ?? selected;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!selected || connect.isPending || active}
          onClick={() =>
            selected && connect.mutate({ instanceId: selected, show: false })
          }
        >
          {t("connect")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!instanceId || connect.isPending || stop.isPending}
          onClick={() =>
            instanceId && connect.mutate({ instanceId, show: true })
          }
        >
          {t("showOnTv")}
        </Button>
        {active && (
          <Button
            size="sm"
            variant="outline"
            disabled={stop.isPending}
            onClick={() => stop.mutate()}
          >
            {t("stop")}
          </Button>
        )}
        {!active && device.instanceId && (
          <Button
            size="sm"
            variant="outline"
            disabled={connect.isPending}
            onClick={() =>
              device.instanceId &&
              connect.mutate({ instanceId: device.instanceId, show: false })
            }
          >
            {t("reconnect")}
          </Button>
        )}
        {active && selected && selected !== device.instanceId && (
          <Button
            size="sm"
            variant="outline"
            disabled={connect.isPending}
            onClick={() =>
              connect.mutate({ instanceId: selected, show: false })
            }
          >
            {t("switchInstance")}
          </Button>
        )}
      </div>
      {(connect.error || stop.error) && (
        <p role="alert" className="text-destructive text-sm">
          {connect.error?.message ?? stop.error?.message}
        </p>
      )}
    </div>
  );
}

function CastPage() {
  const { t } = useTranslation("cast");
  const { instanceListQueryOptions } = Route.useRouteContext();
  const { data: instances, error: instanceError } = useQuery(
    instanceListQueryOptions,
  );
  const instanceItems = useMemo(
    () =>
      instances?.instances.map((item) => ({
        value: item.id,
        label: item.friendlyName,
      })) ?? [],
    [instances],
  );
  const { instance } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { state, error } = useSelector(castStore, (value) => value);
  const [search, setSearch] = useState("");
  const [filter] = useDebouncedValue(search, { wait: 150 });
  const devices = useMemo(
    () =>
      state?.devices.filter((device) =>
        device.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
      ) ?? [],
    [state?.devices, filter],
  );
  const columns = useMemo<ColumnDef<typeof features, CastDeviceState>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("display"),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span>{row.original.name}</span>
            <span className="text-muted-foreground text-xs">
              {row.original.address}:{row.original.port}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "instanceName",
        header: t("instance"),
        cell: ({ row }) => row.original.instanceName ?? t("none"),
      },
      {
        accessorKey: "phase",
        header: t("status"),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span>{t(`phase.${row.original.phase}`)}</span>
            {row.original.phase === "ready" && (
              <span className="text-muted-foreground text-xs">
                {t(`visibility.${row.original.visibility}`)}
                {row.original.metricsAt &&
                Date.now() - row.original.metricsAt > STALE_AFTER_MS
                  ? ` · ${t("stale")}`
                  : ""}
              </span>
            )}
            {row.original.error && (
              <span className="text-destructive text-xs">
                {row.original.error}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: t("actions"),
        cell: ({ row }) => (
          <DeviceActions device={row.original} selected={instance} />
        ),
      },
    ],
    [instance, t],
  );
  const table = useTable({
    features,
    data: devices,
    columns,
    getRowId: (row) => row.id,
    initialState: { sorting: [{ id: "name", desc: false }] },
  });
  const first = state?.devices.find((device) => device.phase === "ready");
  const show = useMutation({
    mutationFn: async () => {
      if (!first?.instanceId) return;
      const source = getCastSource(first.instanceId);
      if (source) await castClient.connect(first, source, true);
    },
    retry: false,
  });
  useHotkey("Mod+Shift+C", () => show.mutate(), {
    enabled: Boolean(first) && !show.isPending,
  });
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <Button variant="ghost" className="w-fit" render={<Link to="/user" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          {t("back")}
        </Button>
        <div className="flex items-center gap-2">
          <CastIcon />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>
      {!isDesktopApp() ? (
        <Alert>
          <AlertTitle>{t("desktopRequired")}</AlertTitle>
          <AlertDescription>{t("desktopDescription")}</AlertDescription>
        </Alert>
      ) : (
        <>
          {(error || instanceError || show.error) && (
            <Alert variant="destructive">
              <AlertTitle>{t("error")}</AlertTitle>
              <AlertDescription>
                {error ?? instanceError?.message ?? show.error?.message}
              </AlertDescription>
            </Alert>
          )}
          <section className="flex flex-col gap-4" aria-label={t("displays")}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="cast-instance">{t("instance")}</FieldLabel>
                <Select
                  items={instanceItems}
                  value={instance ?? null}
                  onValueChange={(value) => {
                    void navigate({
                      search: { instance: value ?? undefined },
                      replace: true,
                    });
                  }}
                >
                  <SelectTrigger id="cast-instance" className="w-full">
                    <SelectValue placeholder={t("chooseInstance")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {instanceItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{t("instanceDescription")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="cast-search">{t("search")}</FieldLabel>
                <Input
                  id="cast-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.column.getCanSort() ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <table.FlexRender header={header} />
                          </Button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {devices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length}>
                      {state ? t("noDevices") : t("discovering")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <p className="text-muted-foreground text-sm">
              {t("showDescription")}
            </p>
          </section>
          <ManualConnection instance={instance} />
          {state && <DisplayForm settings={state.settings} />}
        </>
      )}
    </main>
  );
}

const ManualDevice = Schema.Struct({
  address: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9:.[\]-]+$/)),
  port: CastDevice.fields.port,
});
function ManualConnection({ instance }: { instance: string | undefined }) {
  const { t } = useTranslation("cast");
  const connect = useMutation({
    mutationFn: (device: CastDevice) => {
      const source = instance ? getCastSource(instance) : null;
      if (!source) return Promise.reject(new Error(t("chooseInstance")));
      return castClient.connect(device, source);
    },
    retry: false,
  });
  const form = useForm({
    defaultValues: { address: "", port: 8009 },
    validators: { onSubmit: Schema.toStandardSchemaV1(ManualDevice) },
    onSubmit: async ({ value }) => {
      const address = value.address.replace(/^\[|\]$/g, "");
      const known = castStore
        .get()
        .state?.devices.find(
          (device) => device.address === address && device.port === value.port,
        );
      await connect
        .mutateAsync(
          known ?? {
            id: `manual:${address}:${value.port}`,
            name: address,
            address,
            port: value.port,
          },
        )
        .catch(() => undefined);
    },
  });
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t("manual")}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field name="address">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="cast-address">{t("address")}</FieldLabel>
                <Input
                  id="cast-address"
                  placeholder="192.168.1.50"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(event.target.value.trim())
                  }
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="port">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="cast-port">{t("port")}</FieldLabel>
                <Input
                  id="cast-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(Number(event.target.value))
                  }
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <Button
            type="submit"
            className="w-fit"
            disabled={!instance || connect.isPending}
          >
            {connect.isPending ? t("phase.connecting") : t("connect")}
          </Button>
        </FieldGroup>
      </form>
      {connect.error && (
        <p role="alert" className="text-destructive text-sm">
          {connect.error.message}
        </p>
      )}
    </section>
  );
}

function DisplayForm({ settings }: { settings: DisplaySettings }) {
  const { t } = useTranslation("cast");
  const historyItems = [60, 300, 900, 1800].map((seconds) => ({
    value: String(seconds),
    label: t("minutes", { count: seconds / 60 }),
  }));
  const scaleItems = [
    { value: "normal", label: t("normal") },
    { value: "large", label: t("large") },
  ];
  const save = useMutation({
    mutationFn: castClient.setSettings,
    retry: false,
  });
  const form = useForm({
    defaultValues: settings,
    validators: { onSubmit: Schema.toStandardSchemaV1(DisplaySettings) },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  const submit = useDebouncedCallback(
    () => {
      void form.handleSubmit();
    },
    { wait: 400 },
  );
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t("settings")}</h2>
      <p className="text-muted-foreground text-sm">
        {t("settingsDescription")}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field name="charts">
            {(field) => (
              <FieldSet>
                <FieldLegend>{t("charts")}</FieldLegend>
                <div className="flex flex-wrap gap-4">
                  {DEFAULT_SETTINGS.charts.map((id) => (
                    <Field key={id} orientation="horizontal">
                      <Checkbox
                        id={`cast-chart-${id}`}
                        checked={field.state.value.includes(id)}
                        onCheckedChange={(checked) => {
                          field.handleChange(
                            checked
                              ? [...field.state.value, id]
                              : field.state.value.filter(
                                  (chart) => chart !== id,
                                ),
                          );
                          submit();
                        }}
                      />
                      <FieldLabel htmlFor={`cast-chart-${id}`}>
                        {t(`chart.${id}`)}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>
            )}
          </form.Field>
          <form.Field name="historySeconds">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="cast-history">{t("history")}</FieldLabel>
                <Select
                  items={historyItems}
                  value={String(field.state.value)}
                  onValueChange={(value) => {
                    field.handleChange(
                      Schema.decodeUnknownSync(
                        DisplaySettings.fields.historySeconds,
                      )(Number(value)),
                    );
                    submit();
                  }}
                >
                  <SelectTrigger id="cast-history">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[60, 300, 900, 1800].map((seconds) => (
                        <SelectItem key={seconds} value={String(seconds)}>
                          {t("minutes", { count: seconds / 60 })}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          <form.Field name="scale">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="cast-scale">{t("scale")}</FieldLabel>
                <Select
                  items={scaleItems}
                  value={field.state.value}
                  onValueChange={(value) => {
                    field.handleChange(
                      Schema.decodeUnknownSync(DisplaySettings.fields.scale)(
                        value,
                      ),
                    );
                    submit();
                  }}
                >
                  <SelectTrigger id="cast-scale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="normal">{t("normal")}</SelectItem>
                      <SelectItem value="large">{t("large")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          <p className="text-muted-foreground text-sm" role="status">
            {save.isPending
              ? t("saving")
              : save.isSuccess
                ? t("saved")
                : t("autosave")}
          </p>
        </FieldGroup>
      </form>
      {save.error && (
        <p role="alert" className="text-destructive text-sm">
          {save.error.message}
        </p>
      )}
    </section>
  );
}
