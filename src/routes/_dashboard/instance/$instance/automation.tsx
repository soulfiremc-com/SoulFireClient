import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BrainCircuitIcon,
  ChevronRightIcon,
  CrosshairIcon,
  PackageIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  Settings2Icon,
  StopCircleIcon,
  WaypointsIcon,
} from "lucide-react";
import {
  Suspense,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { SFTimeAgo } from "@/components/sf-timeago.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item.tsx";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { TimestampSchema } from "@/generated/google/protobuf/timestamp_pb.ts";
import {
  type AutomationBotSettings,
  AutomationBotSettingsSchema,
  type AutomationBotState,
  type AutomationCoordinationClaim,
  type AutomationCoordinationState,
  AutomationCoordinationStateSchema,
  AutomationGoalMode,
  type AutomationInstanceSettings,
  AutomationInstanceSettingsSchema,
  type AutomationMemoryState,
  AutomationMemoryStateSchema,
  AutomationPreset,
  AutomationRolePolicy,
  AutomationService,
  AutomationTeamObjective,
  AutomationTeamRole,
  type AutomationTeamState,
  AutomationTeamStateSchema,
} from "@/generated/soulfire/automation_pb.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { cn, timestampToDate } from "@/lib/utils.tsx";
import { createTransport } from "@/lib/web-rpc.ts";

const presetOptions = [
  { value: AutomationPreset.BALANCED_TEAM, label: "Balanced Team" },
  { value: AutomationPreset.INDEPENDENT_RUNNERS, label: "Independent Runners" },
  { value: AutomationPreset.CAUTIOUS_TEAM, label: "Cautious Team" },
] as const;

const rolePolicyOptions = [
  { value: AutomationRolePolicy.STATIC_TEAM, label: "Static Team" },
  { value: AutomationRolePolicy.INDEPENDENT, label: "Independent" },
] as const;

const objectiveOptions = [
  { value: AutomationTeamObjective.UNSPECIFIED, label: "Auto" },
  { value: AutomationTeamObjective.BOOTSTRAP, label: "Bootstrap" },
  { value: AutomationTeamObjective.NETHER_PROGRESS, label: "Nether Progress" },
  { value: AutomationTeamObjective.STRONGHOLD_HUNT, label: "Stronghold Hunt" },
  { value: AutomationTeamObjective.END_ASSAULT, label: "End Assault" },
  { value: AutomationTeamObjective.COMPLETE, label: "Complete" },
] as const;

const roleOverrideOptions = [
  { value: AutomationTeamRole.UNSPECIFIED, label: "Auto" },
  { value: AutomationTeamRole.LEAD, label: "Lead" },
  { value: AutomationTeamRole.PORTAL_ENGINEER, label: "Portal Engineer" },
  { value: AutomationTeamRole.NETHER_RUNNER, label: "Nether Runner" },
  { value: AutomationTeamRole.STRONGHOLD_SCOUT, label: "Stronghold Scout" },
  { value: AutomationTeamRole.END_SUPPORT, label: "End Support" },
] as const;

const quotaOverrideConfigs = [
  {
    requirementKey: "item:minecraft:blaze_rod",
    alias: "blaze_rod",
    label: "Blaze Rod",
    min: 0,
    max: 64,
    readSetting: (settings: AutomationInstanceSettings) =>
      settings.targetBlazeRods,
  },
  {
    requirementKey: "item:minecraft:ender_pearl",
    alias: "ender_pearl",
    label: "Ender Pearl",
    min: 0,
    max: 64,
    readSetting: (settings: AutomationInstanceSettings) =>
      settings.targetEnderPearls,
  },
  {
    requirementKey: "item:minecraft:ender_eye",
    alias: "ender_eye",
    label: "Ender Eye",
    min: 0,
    max: 64,
    readSetting: (settings: AutomationInstanceSettings) =>
      settings.targetEnderEyes,
  },
  {
    requirementKey: "item:minecraft:arrow",
    alias: "arrow",
    label: "Arrow",
    min: 0,
    max: 512,
    readSetting: (settings: AutomationInstanceSettings) =>
      settings.targetArrows,
  },
  {
    requirementKey: "group:any_bed",
    alias: "bed",
    label: "Any Bed",
    min: 0,
    max: 64,
    readSetting: (settings: AutomationInstanceSettings) => settings.targetBeds,
  },
] as const;

const botTuningNumberConfigs = [
  {
    key: "memoryScanRadius",
    label: "Memory Scan Radius",
    description:
      "Default 48, range 8-96. Larger scans discover more blocks but cost more work.",
    min: 8,
    max: 96,
  },
  {
    key: "memoryScanIntervalTicks",
    label: "Memory Scan Interval",
    description:
      "Default 20 ticks, range 1-200. Lower values rescan more aggressively.",
    min: 1,
    max: 200,
  },
  {
    key: "retreatHealthThreshold",
    label: "Retreat Health",
    description:
      "Default 8, range 1-20. Automation disengages at or below this health.",
    min: 1,
    max: 20,
  },
  {
    key: "retreatFoodThreshold",
    label: "Eat Food Threshold",
    description:
      "Default 12, range 1-20. Automation interrupts to eat at or below this food level.",
    min: 1,
    max: 20,
  },
] as const;

type BotSettingsDraft = {
  enabled: boolean;
  allowDeathRecovery: boolean;
  roleOverride: AutomationTeamRole;
  memoryScanRadius: string;
  memoryScanIntervalTicks: string;
  retreatHealthThreshold: string;
  retreatFoodThreshold: string;
};

type BotSettingsPatch = {
  enabled?: boolean;
  allowDeathRecovery?: boolean;
  roleOverride?: AutomationTeamRole;
  memoryScanRadius?: number;
  memoryScanIntervalTicks?: number;
  retreatHealthThreshold?: number;
  retreatFoodThreshold?: number;
};

type BotAttentionSeverity = "ok" | "warning" | "critical";

type BotAttentionStatus = {
  severity: BotAttentionSeverity;
  label: string;
  summary: string;
  reasons: string[];
  operatorHint: string;
};

type BotAttentionEntry = {
  bot: AutomationBotState;
  attention: BotAttentionStatus;
};

type CoordinationClaimKind =
  | "block"
  | "entity"
  | "explore"
  | "explore3d"
  | "other";

type CoordinationClaimInsight = {
  claim: AutomationCoordinationClaim;
  kind: CoordinationClaimKind;
  kindLabel: string;
  purpose: string;
  purposeLabel: string;
  ownerBot: AutomationBotState | undefined;
  expiresInSeconds: number | null;
  expiringSoon: boolean;
  searchText: string;
};

type BotClaimSummary = {
  ownedClaims: CoordinationClaimInsight[];
  totalOwnedClaims: number;
  expiringSoonCount: number;
  breakdown: string;
  note: string;
};

const NO_CHANGE = "__no_change__";

function getQuotaProgressPercentage(current: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
}

function getQuotaProgressIndicatorClassName(percentage: number) {
  if (percentage >= 100) {
    return "[&_[data-slot=progress-indicator]]:bg-emerald-500 dark:[&_[data-slot=progress-indicator]]:bg-emerald-400";
  }

  if (percentage >= 50) {
    return "[&_[data-slot=progress-indicator]]:bg-primary";
  }

  return "[&_[data-slot=progress-indicator]]:bg-amber-500 dark:[&_[data-slot=progress-indicator]]:bg-amber-400";
}

function InlineEmptyState(props: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <Empty className={cn("border-0 px-0 py-4", props.className)}>
      <EmptyHeader className="max-w-none gap-1">
        <EmptyTitle className="text-sm">{props.title}</EmptyTitle>
        {props.description ? (
          <EmptyDescription className="text-xs">
            {props.description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}

function QuotaSummaryProgress(props: {
  label: string;
  current: number;
  target: number;
}) {
  const percentage = getQuotaProgressPercentage(props.current, props.target);

  return (
    <Progress
      value={percentage}
      className={cn(
        "w-auto flex-nowrap items-center gap-1.5 [&>[data-slot=progress-track]]:order-2 [&>[data-slot=progress-track]]:w-12 [&>[data-slot=progress-track]]:shrink-0",
        getQuotaProgressIndicatorClassName(percentage),
      )}
    >
      <ProgressLabel className="order-1 text-xs font-normal text-muted-foreground">
        {props.label}
      </ProgressLabel>
      <ProgressValue className="order-3 ml-0 text-xs text-muted-foreground">
        {() => `${props.current}/${props.target}`}
      </ProgressValue>
    </Progress>
  );
}

function QuotaEditorProgress(props: {
  label: string;
  current: number;
  target: number;
  configuredTarget: number;
}) {
  const percentage = getQuotaProgressPercentage(props.current, props.target);

  return (
    <Progress
      value={percentage}
      className={cn("gap-2", getQuotaProgressIndicatorClassName(percentage))}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <ProgressLabel className="font-medium">{props.label}</ProgressLabel>
        <ProgressValue className="ml-0 text-muted-foreground tabular-nums">
          {() => (
            <>
              {props.current}/{props.target}
              {props.configuredTarget > 0 ? (
                <span className="ml-1 text-xs">(manual)</span>
              ) : null}
            </>
          )}
        </ProgressValue>
      </div>
    </Progress>
  );
}

export const Route = createFileRoute(
  "/_dashboard/instance/$instance/automation",
)({
  beforeLoad: (props) => {
    const { instance } = props.params;
    const automationTeamStateQueryOptions = queryOptions({
      queryKey: ["automation-team-state", instance],
      queryFn: async (queryProps): Promise<AutomationTeamState> => {
        const transport = createTransport();
        if (transport === null) {
          return createDemoAutomationTeamState(instance);
        }

        const automationService = createClient(AutomationService, transport);
        const result = await automationService.getAutomationTeamState(
          { instanceId: instance },
          { signal: queryProps.signal },
        );
        return (
          result.state ??
          create(AutomationTeamStateSchema, {
            instanceId: instance,
          })
        );
      },
      refetchInterval: 2_000,
    });
    const automationCoordinationStateQueryOptions = queryOptions({
      queryKey: ["automation-coordination-state", instance],
      queryFn: async (queryProps): Promise<AutomationCoordinationState> => {
        const transport = createTransport();
        if (transport === null) {
          return createDemoAutomationCoordinationState(instance);
        }

        const automationService = createClient(AutomationService, transport);
        const result = await automationService.getAutomationCoordinationState(
          { instanceId: instance, maxEntries: 12 },
          { signal: queryProps.signal },
        );
        return (
          result.state ??
          create(AutomationCoordinationStateSchema, {
            instanceId: instance,
          })
        );
      },
      refetchInterval: 2_000,
    });
    return {
      automationTeamStateQueryOptions,
      automationCoordinationStateQueryOptions,
      ...staticRouteChrome(() => i18n.t("common:pageName.automation"), {
        kind: "dynamic",
        name: "bot-message-square",
      }),
    };
  },
  loader: (props) => {
    void props.context.queryClient.prefetchQuery(
      props.context.automationTeamStateQueryOptions,
    );
    void props.context.queryClient.prefetchQuery(
      props.context.automationCoordinationStateQueryOptions,
    );
  },
  component: AutomationDashboard,
});

function AutomationDashboardSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4 py-4">
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="divide-border overflow-hidden rounded-lg border divide-y">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}

function AutomationDashboard() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "controls",
          content: t("breadcrumbs.controls"),
        },
      ]}
      pageName={t("pageName.automation")}
      loadingSkeleton={<AutomationDashboardSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { t } = useTranslation("instance");
  const queryClient = useQueryClient();
  const { instance: instanceId } = Route.useParams();
  const {
    automationTeamStateQueryOptions,
    automationCoordinationStateQueryOptions,
  } = Route.useRouteContext();
  const { data: teamState } = useSuspenseQuery(automationTeamStateQueryOptions);
  const { data: coordinationState } = useSuspenseQuery(
    automationCoordinationStateQueryOptions,
  );
  const teamSettings =
    teamState.settings ?? create(AutomationInstanceSettingsSchema, {});
  const [acquireTarget, setAcquireTarget] = useState("ender_pearl");
  const [acquireCount, setAcquireCount] = useState("4");
  const [maxEndBotsInput, setMaxEndBotsInput] = useState(
    String(teamSettings.maxEndBots),
  );
  const [quotaInputs, setQuotaInputs] = useState<Record<string, string>>(() =>
    createQuotaInputState(teamSettings),
  );
  const [botSearch, setBotSearch] = useState("");
  const deferredBotSearch = useDeferredValue(botSearch);
  const [botRoleFilter, setBotRoleFilter] = useState("all");
  const [botStatusFilter, setBotStatusFilter] = useState("all");
  const [botDimensionFilter, setBotDimensionFilter] = useState("all");
  const [botAttentionFilter, setBotAttentionFilter] = useState("all");
  const [claimSearch, setClaimSearch] = useState("");
  const deferredClaimSearch = useDeferredValue(claimSearch);
  const [claimOwnerFilter, setClaimOwnerFilter] = useState("all");
  const [claimTypeFilter, setClaimTypeFilter] = useState("all");
  const [claimFocusBotId, setClaimFocusBotId] = useState("");
  const [selectedBots, setSelectedBots] = useState<Record<string, boolean>>({});
  const [bulkEnabledInput, setBulkEnabledInput] = useState(NO_CHANGE);
  const [bulkDeathRecoveryInput, setBulkDeathRecoveryInput] =
    useState(NO_CHANGE);
  const [bulkRoleOverrideInput, setBulkRoleOverrideInput] = useState(NO_CHANGE);
  const [memoryBotId, setMemoryBotId] = useState("");
  const [memoryMaxEntriesInput, setMemoryMaxEntriesInput] = useState("8");
  const [bottomTab, setBottomTab] = useState<
    "health" | "claims" | "memory" | "intel"
  >("health");
  const transport = createTransport();
  const isReadOnlyDemo = transport === null;

  useEffect(() => {
    setMaxEndBotsInput(String(teamSettings.maxEndBots));
  }, [teamSettings.maxEndBots]);

  useEffect(() => {
    setQuotaInputs(createQuotaInputState(teamSettings));
  }, [
    teamSettings.targetArrows,
    teamSettings.targetBeds,
    teamSettings.targetBlazeRods,
    teamSettings.targetEnderEyes,
    teamSettings.targetEnderPearls,
    teamSettings,
  ]);

  useEffect(() => {
    setSelectedBots((current) => {
      const visibleBotIds = new Set(teamState.bots.map((bot) => bot.botId));
      return Object.fromEntries(
        Object.entries(current).filter(
          ([botId, selected]) => selected && visibleBotIds.has(botId),
        ),
      );
    });
  }, [teamState.bots]);

  useEffect(() => {
    if (teamState.bots.length === 0) {
      if (memoryBotId.length > 0) {
        setMemoryBotId("");
      }
      if (claimFocusBotId.length > 0) {
        setClaimFocusBotId("");
      }
      return;
    }

    const hasSelectedMemoryBot = teamState.bots.some(
      (bot) => bot.botId === memoryBotId,
    );
    if (!hasSelectedMemoryBot) {
      const firstBot = teamState.bots[0];
      if (firstBot) {
        setMemoryBotId(firstBot.botId);
      }
    }
    if (
      claimFocusBotId.length > 0 &&
      !teamState.bots.some((bot) => bot.botId === claimFocusBotId)
    ) {
      setClaimFocusBotId("");
    }
  }, [claimFocusBotId, memoryBotId, teamState.bots]);

  const invalidateAutomation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: automationTeamStateQueryOptions.queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: automationCoordinationStateQueryOptions.queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: ["automation-memory-state", instanceId],
      }),
    ]);
  };

  const teamActionMutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "beat" }
        | { kind: "pause" }
        | { kind: "resume" }
        | { kind: "stop" }
        | { kind: "reset-coordination" }
        | { kind: "acquire"; target: string; count: number },
    ) => {
      const activeTransport = createTransport();
      if (activeTransport === null) {
        return;
      }

      const automationService = createClient(
        AutomationService,
        activeTransport,
      );
      switch (action.kind) {
        case "beat":
          return automationService.startAutomationBeat({ instanceId });
        case "pause":
          return automationService.pauseAutomation({ instanceId });
        case "resume":
          return automationService.resumeAutomation({ instanceId });
        case "stop":
          return automationService.stopAutomation({ instanceId });
        case "reset-coordination":
          return automationService.resetAutomationCoordinationState({
            instanceId,
          });
        case "acquire":
          return automationService.startAutomationAcquire({
            instanceId,
            target: action.target,
            count: action.count,
          });
      }
    },
    onSuccess: async (_, action) => {
      await invalidateAutomation();
      toast.success(
        action.kind === "acquire"
          ? `Started acquire goal for ${action.target} x${action.count}.`
          : action.kind === "reset-coordination"
            ? "Automation coordination state reset."
            : `Automation ${action.kind} request sent.`,
      );
    },
    onError: (error) => {
      toast.error("Automation action failed.", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const teamSettingMutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "preset"; preset: AutomationPreset }
        | { kind: "collaboration"; enabled: boolean }
        | { kind: "role-policy"; rolePolicy: AutomationRolePolicy }
        | { kind: "shared-structures"; enabled: boolean }
        | { kind: "shared-claims"; enabled: boolean }
        | { kind: "shared-end-entry"; enabled: boolean }
        | { kind: "max-end-bots"; maxEndBots: number }
        | {
            kind: "quota-override";
            requirementKey: string;
            targetCount: number;
          }
        | { kind: "objective"; objective: AutomationTeamObjective },
    ) => {
      const activeTransport = createTransport();
      if (activeTransport === null) {
        return;
      }

      const automationService = createClient(
        AutomationService,
        activeTransport,
      );
      switch (action.kind) {
        case "preset":
          return automationService.applyAutomationPreset({
            instanceId,
            preset: action.preset,
          });
        case "collaboration":
          return automationService.setAutomationCollaboration({
            instanceId,
            enabled: action.enabled,
          });
        case "role-policy":
          return automationService.setAutomationRolePolicy({
            instanceId,
            rolePolicy: action.rolePolicy,
          });
        case "shared-structures":
          return automationService.setAutomationSharedStructures({
            instanceId,
            enabled: action.enabled,
          });
        case "shared-claims":
          return automationService.setAutomationSharedClaims({
            instanceId,
            enabled: action.enabled,
          });
        case "shared-end-entry":
          return automationService.setAutomationSharedEndEntry({
            instanceId,
            enabled: action.enabled,
          });
        case "max-end-bots":
          return automationService.setAutomationMaxEndBots({
            instanceId,
            maxEndBots: action.maxEndBots,
          });
        case "quota-override":
          return automationService.setAutomationQuotaOverride({
            instanceId,
            requirementKey: action.requirementKey,
            targetCount: action.targetCount,
          });
        case "objective":
          return automationService.setAutomationObjectiveOverride({
            instanceId,
            objective: action.objective,
          });
      }
    },
    onSuccess: async (_, action) => {
      await invalidateAutomation();
      if (action.kind === "preset") {
        toast.success(`Applied ${presetLabel(action.preset)} preset.`);
        return;
      }
      if (action.kind === "quota-override") {
        const quotaConfig = quotaOverrideConfig(action.requirementKey);
        toast.success(
          action.targetCount === 0
            ? `Restored ${quotaConfig.label} quota to auto.`
            : `Set ${quotaConfig.label} quota to ${action.targetCount}.`,
        );
      }
    },
    onError: (error) => {
      toast.error("Automation settings update failed.", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const botActionMutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "pause"; botIds: string[]; label: string }
        | { kind: "resume"; botIds: string[]; label: string }
        | { kind: "stop"; botIds: string[]; label: string }
        | { kind: "reset-memory"; botIds: string[]; label: string }
        | { kind: "release-claims"; botIds: string[]; label: string },
    ) => {
      const activeTransport = createTransport();
      if (activeTransport === null) {
        return;
      }

      const automationService = createClient(
        AutomationService,
        activeTransport,
      );
      switch (action.kind) {
        case "pause":
          return automationService.pauseAutomation({
            instanceId,
            botIds: action.botIds,
          });
        case "resume":
          return automationService.resumeAutomation({
            instanceId,
            botIds: action.botIds,
          });
        case "stop":
          return automationService.stopAutomation({
            instanceId,
            botIds: action.botIds,
          });
        case "reset-memory":
          return automationService.resetAutomationMemory({
            instanceId,
            botIds: action.botIds,
          });
        case "release-claims":
          return automationService.releaseAutomationBotClaims({
            instanceId,
            botIds: action.botIds,
          });
      }
    },
    onSuccess: async (_, action) => {
      await invalidateAutomation();
      toast.success(`${action.label}: ${action.kind.replace("-", " ")}.`);
    },
    onError: (error) => {
      toast.error("Bot automation action failed.", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const botSettingsMutation = useMutation({
    mutationFn: async (action: {
      botIds: string[];
      label: string;
      patch: BotSettingsPatch;
    }) => {
      const activeTransport = createTransport();
      if (activeTransport === null) {
        return;
      }

      const automationService = createClient(
        AutomationService,
        activeTransport,
      );
      return automationService.updateAutomationBotSettings({
        instanceId,
        botIds: action.botIds,
        ...action.patch,
      });
    },
    onSuccess: async (_, action) => {
      await invalidateAutomation();
      toast.success(`${action.label}: automation settings updated.`);
    },
    onError: (error) => {
      toast.error("Failed to update automation settings.", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (claimKey: string) => {
      const activeTransport = createTransport();
      if (activeTransport === null) {
        return;
      }

      const automationService = createClient(
        AutomationService,
        activeTransport,
      );
      return automationService.releaseAutomationClaim({
        instanceId,
        key: claimKey,
      });
    },
    onSuccess: async (_, claimKey) => {
      await invalidateAutomation();
      toast.success(`Released claim ${claimKey}.`);
    },
    onError: (error) => {
      toast.error("Failed to release claim.", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const quotaCards = useMemo(
    () =>
      quotaOverrideConfigs.map((config) => {
        const liveQuota = teamState.quotas.find(
          (quota) => quota.requirementKey === config.requirementKey,
        );
        return {
          key: config.requirementKey,
          alias: config.alias,
          label: config.label,
          min: config.min,
          max: config.max,
          current: liveQuota?.currentCount ?? 0,
          target: liveQuota?.targetCount ?? 0,
          configuredTarget: config.readSetting(teamSettings),
        };
      }),
    [teamSettings, teamState.quotas],
  );

  const botDimensionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          teamState.bots.map((bot) =>
            normalizeBotDimension(bot.dimension || "unknown"),
          ),
        ),
      ).sort(),
    [teamState.bots],
  );
  const botAttentionEntries = useMemo(() => {
    const nowMs = Date.now();
    return teamState.bots
      .map((bot) => ({
        bot,
        attention: describeBotAttention(bot, nowMs),
      }))
      .sort(compareBotAttentionEntries);
  }, [teamState.bots]);
  const botAttentionById = useMemo(
    () =>
      new Map(
        botAttentionEntries.map((entry) => [entry.bot.botId, entry.attention]),
      ),
    [botAttentionEntries],
  );
  const attentionCounts = useMemo(
    () =>
      botAttentionEntries.reduce(
        (counts, entry) => {
          if (entry.attention.severity === "critical") {
            counts.critical += 1;
          } else if (entry.attention.severity === "warning") {
            counts.warning += 1;
          } else {
            counts.healthy += 1;
          }
          return counts;
        },
        { critical: 0, warning: 0, healthy: 0 },
      ),
    [botAttentionEntries],
  );
  const attentionBotIds = useMemo(
    () =>
      botAttentionEntries
        .filter((entry) => entry.attention.severity !== "ok")
        .map((entry) => entry.bot.botId),
    [botAttentionEntries],
  );
  const criticalBotIds = useMemo(
    () =>
      botAttentionEntries
        .filter(
          (entry) =>
            entry.attention.severity === "critical" && !entry.bot.paused,
        )
        .map((entry) => entry.bot.botId),
    [botAttentionEntries],
  );
  const healthyPausedBotIds = useMemo(
    () =>
      teamState.bots
        .filter((bot) => isHealthyPausedResumeCandidate(bot))
        .map((bot) => bot.botId),
    [teamState.bots],
  );
  const botById = useMemo(
    () => new Map(teamState.bots.map((bot) => [bot.botId, bot])),
    [teamState.bots],
  );
  const claimInsights = useMemo(() => {
    const nowMs = Date.now();
    return coordinationState.claims
      .map((claim) => describeCoordinationClaim(claim, botById, nowMs))
      .sort(compareCoordinationClaimInsights);
  }, [botById, coordinationState.claims]);
  const claimOwnerOptions = useMemo(
    () =>
      claimInsights
        .map((insight) => ({
          value: insight.claim.ownerBotId,
          label:
            insight.ownerBot?.accountName ?? insight.claim.ownerAccountName,
        }))
        .filter(
          (option, index, options) =>
            option.value.length > 0 &&
            options.findIndex((entry) => entry.value === option.value) ===
              index,
        )
        .sort((left, right) => left.label.localeCompare(right.label)),
    [claimInsights],
  );
  const filteredClaimInsights = useMemo(() => {
    const normalizedSearch = deferredClaimSearch.trim().toLowerCase();
    return claimInsights.filter((insight) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        insight.searchText.includes(normalizedSearch);
      const matchesOwner =
        claimOwnerFilter === "all" ||
        insight.claim.ownerBotId === claimOwnerFilter;
      const matchesType =
        claimTypeFilter === "all" || insight.kind === claimTypeFilter;
      const matchesFocus =
        claimFocusBotId.length === 0 ||
        insight.claim.ownerBotId === claimFocusBotId;
      return matchesSearch && matchesOwner && matchesType && matchesFocus;
    });
  }, [
    claimFocusBotId,
    claimInsights,
    claimOwnerFilter,
    claimTypeFilter,
    deferredClaimSearch,
  ]);
  const claimCounts = useMemo(
    () =>
      claimInsights.reduce(
        (counts, insight) => {
          counts.total += 1;
          counts[insight.kind] += 1;
          if (insight.expiringSoon) {
            counts.expiringSoon += 1;
          }
          return counts;
        },
        {
          total: 0,
          block: 0,
          entity: 0,
          explore: 0,
          explore3d: 0,
          other: 0,
          expiringSoon: 0,
        },
      ),
    [claimInsights],
  );
  const botClaimSummaryById = useMemo(
    () =>
      new Map(
        teamState.bots.map((bot) => [
          bot.botId,
          summarizeBotClaims(
            bot,
            claimInsights.filter(
              (insight) => insight.claim.ownerBotId === bot.botId,
            ),
            botAttentionById.get(bot.botId) ?? createHealthyBotAttention(),
          ),
        ]),
      ),
    [botAttentionById, claimInsights, teamState.bots],
  );
  const focusedClaimBot =
    claimFocusBotId.length === 0 ? undefined : botById.get(claimFocusBotId);

  const filteredBots = useMemo(() => {
    const normalizedSearch = deferredBotSearch.trim().toLowerCase();
    return teamState.bots.filter((bot) => {
      const attention =
        botAttentionById.get(bot.botId) ?? createHealthyBotAttention();
      const matchesSearch =
        normalizedSearch.length === 0 ||
        bot.accountName.toLowerCase().includes(normalizedSearch) ||
        bot.statusSummary.toLowerCase().includes(normalizedSearch) ||
        (bot.currentAction ?? "").toLowerCase().includes(normalizedSearch) ||
        (bot.dimension ?? "").toLowerCase().includes(normalizedSearch);
      const matchesRole =
        botRoleFilter === "all" || String(bot.teamRole) === botRoleFilter;
      const matchesStatus =
        botStatusFilter === "all" ||
        (botStatusFilter === "paused" ? bot.paused : !bot.paused);
      const matchesDimension =
        botDimensionFilter === "all" ||
        normalizeBotDimension(bot.dimension || "unknown") ===
          botDimensionFilter;
      const matchesAttention =
        botAttentionFilter === "all" ||
        matchesBotAttentionFilter(attention, botAttentionFilter);
      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus &&
        matchesDimension &&
        matchesAttention
      );
    });
  }, [
    botAttentionById,
    botAttentionFilter,
    botDimensionFilter,
    botRoleFilter,
    botStatusFilter,
    deferredBotSearch,
    teamState.bots,
  ]);

  const filteredBotIds = useMemo(
    () => filteredBots.map((bot) => bot.botId),
    [filteredBots],
  );
  const inspectedMemoryBot = useMemo(
    () =>
      teamState.bots.find((bot) => bot.botId === memoryBotId) ??
      teamState.bots[0],
    [memoryBotId, teamState.bots],
  );
  const memoryMaxEntries = useMemo(
    () =>
      isValidQuotaInput(memoryMaxEntriesInput, 1, 32)
        ? Number(memoryMaxEntriesInput)
        : 8,
    [memoryMaxEntriesInput],
  );
  const selectedBotIds = useMemo(
    () =>
      teamState.bots
        .filter((bot) => selectedBots[bot.botId] === true)
        .map((bot) => bot.botId),
    [selectedBots, teamState.bots],
  );
  const bulkSettingsPatch = useMemo(() => {
    const patch: BotSettingsPatch = {};
    if (bulkEnabledInput !== NO_CHANGE) {
      patch.enabled = bulkEnabledInput === "enabled";
    }
    if (bulkDeathRecoveryInput !== NO_CHANGE) {
      patch.allowDeathRecovery = bulkDeathRecoveryInput === "enabled";
    }
    if (bulkRoleOverrideInput !== NO_CHANGE) {
      patch.roleOverride = Number(bulkRoleOverrideInput) as AutomationTeamRole;
    }
    return patch;
  }, [bulkDeathRecoveryInput, bulkEnabledInput, bulkRoleOverrideInput]);
  const hasBulkSettingsPatch = Object.keys(bulkSettingsPatch).length > 0;
  const memoryStateQuery = useQuery({
    queryKey: [
      "automation-memory-state",
      instanceId,
      inspectedMemoryBot?.botId ?? "none",
      memoryMaxEntries,
    ],
    enabled: inspectedMemoryBot !== undefined,
    queryFn: async (queryProps): Promise<AutomationMemoryState> => {
      if (inspectedMemoryBot === undefined) {
        return create(AutomationMemoryStateSchema, {
          instanceId,
        });
      }

      const activeTransport = createTransport();
      if (activeTransport === null) {
        return createDemoAutomationMemoryState(
          instanceId,
          inspectedMemoryBot.botId,
          inspectedMemoryBot.accountName,
          memoryMaxEntries,
        );
      }

      const automationService = createClient(
        AutomationService,
        activeTransport,
      );
      const result = await automationService.getAutomationMemoryState(
        {
          instanceId,
          botId: inspectedMemoryBot.botId,
          maxEntries: memoryMaxEntries,
        },
        { signal: queryProps.signal },
      );
      return (
        result.state ??
        create(AutomationMemoryStateSchema, {
          instanceId,
          botId: inspectedMemoryBot.botId,
          accountName: inspectedMemoryBot.accountName,
        })
      );
    },
    refetchInterval: inspectedMemoryBot ? 2_000 : false,
  });

  return (
    <div className="container flex h-full w-full grow flex-col gap-4 py-4">
      {/* Command Strip */}
      <div className="rounded-lg border p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold">
                {objectiveLabel(teamState.objective)}
              </span>
              <span className="text-muted-foreground">
                {presetLabel(teamSettings.preset)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">
                  {teamState.activeBots}
                </span>{" "}
                active
              </span>
              <span>
                <span className="font-medium text-foreground">
                  {coordinationState.claimCount}
                </span>{" "}
                claims
              </span>
              <span>
                <span className="font-medium text-foreground">
                  {coordinationState.sharedBlockCount}
                </span>{" "}
                shared blocks
              </span>
              {attentionCounts.critical + attentionCounts.warning > 0 && (
                <span
                  className={
                    attentionCounts.critical > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  <span className="font-medium">
                    {attentionCounts.critical + attentionCounts.warning}
                  </span>{" "}
                  need attention
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                disabled={isReadOnlyDemo || teamActionMutation.isPending}
                onClick={() => teamActionMutation.mutate({ kind: "beat" })}
              >
                <PlayIcon className="size-4" />
                Beat
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      disabled={isReadOnlyDemo || teamActionMutation.isPending}
                      onClick={() =>
                        teamActionMutation.mutate({ kind: "pause" })
                      }
                    />
                  }
                >
                  <PauseIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Pause All</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      disabled={isReadOnlyDemo || teamActionMutation.isPending}
                      onClick={() =>
                        teamActionMutation.mutate({ kind: "resume" })
                      }
                    />
                  }
                >
                  <PlayIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Resume All</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      disabled={isReadOnlyDemo || teamActionMutation.isPending}
                      onClick={() =>
                        teamActionMutation.mutate({ kind: "stop" })
                      }
                    />
                  }
                >
                  <StopCircleIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Stop All</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      disabled={isReadOnlyDemo || teamActionMutation.isPending}
                      onClick={() =>
                        teamActionMutation.mutate({
                          kind: "reset-coordination",
                        })
                      }
                    />
                  }
                >
                  <RotateCcwIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Reset Coordination</TooltipContent>
              </Tooltip>
              <Suspense fallback={null}>
                <AutomationSettingsButton instanceId={instanceId} />
              </Suspense>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              {quotaCards.map((quota) => {
                return (
                  <Tooltip key={quota.key}>
                    <TooltipTrigger render={<div />}>
                      <QuotaSummaryProgress
                        label={quota.label}
                        current={quota.current}
                        target={quota.target}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {quota.label}: {quota.current}/{quota.target}
                      {quota.configuredTarget > 0 ? " (manual)" : ""}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Input
                className="h-8 w-36"
                value={acquireTarget}
                onChange={(event) => setAcquireTarget(event.target.value)}
                placeholder={t("automation.acquire.targetPlaceholder")}
                disabled={isReadOnlyDemo || teamActionMutation.isPending}
              />
              <Input
                className="h-8 w-16"
                type="number"
                min={1}
                value={acquireCount}
                onChange={(event) => setAcquireCount(event.target.value)}
                disabled={isReadOnlyDemo || teamActionMutation.isPending}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={
                  isReadOnlyDemo ||
                  teamActionMutation.isPending ||
                  acquireTarget.trim().length === 0 ||
                  !Number.isFinite(Number(acquireCount)) ||
                  Number(acquireCount) < 1
                }
                onClick={() =>
                  teamActionMutation.mutate({
                    kind: "acquire",
                    target: acquireTarget.trim(),
                    count: Number(acquireCount),
                  })
                }
              >
                <PackageIcon className="size-4" />
                Acquire
              </Button>
              <span className="text-xs text-muted-foreground">
                End entry{" "}
                <span className="font-medium text-foreground">
                  {teamSettings.sharedEndEntry
                    ? `max ${teamSettings.maxEndBots}`
                    : "open"}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Team Coordination */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors">
          <ChevronRightIcon className="size-4 transition-transform [[data-state=open]_&]:rotate-90" />
          Team Coordination
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 rounded-lg border p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="grid gap-3">
                <SettingSelect
                  label="Preset"
                  value={String(teamSettings.preset)}
                  options={presetOptions.map((option) => ({
                    value: String(option.value),
                    label: option.label,
                  }))}
                  disabled={isReadOnlyDemo || teamSettingMutation.isPending}
                  onValueChange={(value) =>
                    teamSettingMutation.mutate({
                      kind: "preset",
                      preset: Number(value) as AutomationPreset,
                    })
                  }
                />
                <SettingSelect
                  label="Role Policy"
                  value={String(teamSettings.rolePolicy)}
                  options={rolePolicyOptions.map((option) => ({
                    value: String(option.value),
                    label: option.label,
                  }))}
                  disabled={isReadOnlyDemo || teamSettingMutation.isPending}
                  onValueChange={(value) =>
                    teamSettingMutation.mutate({
                      kind: "role-policy",
                      rolePolicy: Number(value) as AutomationRolePolicy,
                    })
                  }
                />
                <SettingSelect
                  label="Objective Override"
                  value={String(teamSettings.objectiveOverride)}
                  options={objectiveOptions.map((option) => ({
                    value: String(option.value),
                    label: option.label,
                  }))}
                  disabled={isReadOnlyDemo || teamSettingMutation.isPending}
                  onValueChange={(value) =>
                    teamSettingMutation.mutate({
                      kind: "objective",
                      objective: Number(value) as AutomationTeamObjective,
                    })
                  }
                />
                <div className="grid gap-3">
                  <SettingToggle
                    label="Team Collaboration"
                    description="Share roles, claims, and progression."
                    checked={teamSettings.teamCollaboration}
                    disabled={isReadOnlyDemo || teamSettingMutation.isPending}
                    onCheckedChange={(checked) =>
                      teamSettingMutation.mutate({
                        kind: "collaboration",
                        enabled: checked,
                      })
                    }
                  />
                  <SettingToggle
                    label="Shared Structures"
                    description="Reuse portal, fortress, and stronghold intel."
                    checked={teamSettings.sharedStructureIntel}
                    disabled={isReadOnlyDemo || teamSettingMutation.isPending}
                    onCheckedChange={(checked) =>
                      teamSettingMutation.mutate({
                        kind: "shared-structures",
                        enabled: checked,
                      })
                    }
                  />
                  <SettingToggle
                    label="Shared Claims"
                    description="Reserve targets to avoid duplicated work."
                    checked={teamSettings.sharedTargetClaims}
                    disabled={isReadOnlyDemo || teamSettingMutation.isPending}
                    onCheckedChange={(checked) =>
                      teamSettingMutation.mutate({
                        kind: "shared-claims",
                        enabled: checked,
                      })
                    }
                  />
                  <SettingToggle
                    label="Shared End Entry"
                    description="Throttle how many bots enter the End."
                    checked={teamSettings.sharedEndEntry}
                    disabled={isReadOnlyDemo || teamSettingMutation.isPending}
                    onCheckedChange={(checked) =>
                      teamSettingMutation.mutate({
                        kind: "shared-end-entry",
                        enabled: checked,
                      })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium whitespace-nowrap">
                      Max End Bots
                    </p>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      min={1}
                      max={32}
                      value={maxEndBotsInput}
                      disabled={isReadOnlyDemo || teamSettingMutation.isPending}
                      onChange={(event) =>
                        setMaxEndBotsInput(event.target.value)
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        isReadOnlyDemo ||
                        teamSettingMutation.isPending ||
                        !Number.isFinite(Number(maxEndBotsInput)) ||
                        Number(maxEndBotsInput) < 1 ||
                        Number(maxEndBotsInput) > 32 ||
                        Number(maxEndBotsInput) === teamSettings.maxEndBots
                      }
                      onClick={() =>
                        teamSettingMutation.mutate({
                          kind: "max-end-bots",
                          maxEndBots: Number(maxEndBotsInput),
                        })
                      }
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid content-start gap-3">
                <p className="text-sm font-medium">Resource Quotas</p>
                {quotaCards.map((quota) => {
                  return (
                    <div key={quota.key} className="grid gap-2">
                      <QuotaEditorProgress
                        label={quota.label}
                        current={quota.current}
                        target={quota.target}
                        configuredTarget={quota.configuredTarget}
                      />
                      <div className="flex items-center gap-1.5">
                        <Input
                          className="h-7 w-16 text-xs"
                          type="number"
                          min={quota.min}
                          max={quota.max}
                          value={
                            quotaInputs[quota.key] ??
                            String(quota.configuredTarget)
                          }
                          disabled={
                            isReadOnlyDemo || teamSettingMutation.isPending
                          }
                          onChange={(event) =>
                            setQuotaInputs((current) => ({
                              ...current,
                              [quota.key]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={
                            isReadOnlyDemo ||
                            teamSettingMutation.isPending ||
                            !isValidQuotaInput(
                              quotaInputs[quota.key] ??
                                String(quota.configuredTarget),
                              quota.min,
                              quota.max,
                            ) ||
                            Number(
                              quotaInputs[quota.key] ??
                                String(quota.configuredTarget),
                            ) === quota.configuredTarget
                          }
                          onClick={() =>
                            teamSettingMutation.mutate({
                              kind: "quota-override",
                              requirementKey: quota.key,
                              targetCount: Number(
                                quotaInputs[quota.key] ??
                                  String(quota.configuredTarget),
                              ),
                            })
                          }
                        >
                          Set
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={
                            isReadOnlyDemo ||
                            teamSettingMutation.isPending ||
                            quota.configuredTarget === 0
                          }
                          onClick={() =>
                            teamSettingMutation.mutate({
                              kind: "quota-override",
                              requirementKey: quota.key,
                              targetCount: 0,
                            })
                          }
                        >
                          Auto
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Bots Section */}
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Bots {filteredBots.length}/{teamState.bots.length}
          </h3>
          <div className="flex items-center gap-2">
            {selectedBotIds.length > 0 && (
              <Badge variant="secondary">
                {selectedBotIds.length} selected
              </Badge>
            )}
            <Button
              size="xs"
              variant="outline"
              disabled={filteredBotIds.length === 0}
              onClick={() =>
                setSelectedBots((current) => ({
                  ...current,
                  ...Object.fromEntries(
                    filteredBotIds.map((botId) => [botId, true]),
                  ),
                }))
              }
            >
              Select Visible
            </Button>
            {selectedBotIds.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setSelectedBots({})}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 max-w-48"
            value={botSearch}
            onChange={(event) => setBotSearch(event.target.value)}
            placeholder={t("automation.filters.searchBots")}
          />
          <InlineSelect
            label="Bot role filter"
            value={botRoleFilter}
            options={[
              { value: "all", label: "All Roles" },
              ...roleOverrideOptions
                .filter(
                  (option) => option.value !== AutomationTeamRole.UNSPECIFIED,
                )
                .map((option) => ({
                  value: String(option.value),
                  label: option.label,
                })),
            ]}
            onValueChange={setBotRoleFilter}
          />
          <InlineSelect
            label="Bot status filter"
            value={botStatusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "live", label: "Live" },
              { value: "paused", label: "Paused" },
            ]}
            onValueChange={setBotStatusFilter}
          />
          <InlineSelect
            label="Bot health filter"
            value={botAttentionFilter}
            options={[
              { value: "all", label: "All Health" },
              { value: "attention", label: "Needs Attention" },
              { value: "critical", label: "Critical" },
              { value: "healthy", label: "Healthy" },
            ]}
            onValueChange={setBotAttentionFilter}
          />
          <InlineSelect
            label="Bot dimension filter"
            value={botDimensionFilter}
            options={[
              { value: "all", label: "All Dimensions" },
              ...botDimensionOptions.map((dimension) => ({
                value: dimension,
                label: dimensionLabel(dimension),
              })),
            ]}
            onValueChange={setBotDimensionFilter}
          />
        </div>

        {selectedBotIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-sm font-medium">
              Bulk{" "}
              <span className="text-muted-foreground font-normal">
                ({selectedBotIds.length} bot
                {selectedBotIds.length === 1 ? "" : "s"})
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                disabled={isReadOnlyDemo || botActionMutation.isPending}
                onClick={() =>
                  botActionMutation.mutate({
                    kind: "pause",
                    botIds: selectedBotIds,
                    label: formatBotSelectionLabel(selectedBotIds.length),
                  })
                }
              >
                <PauseIcon className="size-3.5" />
                Pause
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={isReadOnlyDemo || botActionMutation.isPending}
                onClick={() =>
                  botActionMutation.mutate({
                    kind: "resume",
                    botIds: selectedBotIds,
                    label: formatBotSelectionLabel(selectedBotIds.length),
                  })
                }
              >
                <PlayIcon className="size-3.5" />
                Resume
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={isReadOnlyDemo || botActionMutation.isPending}
                onClick={() =>
                  botActionMutation.mutate({
                    kind: "stop",
                    botIds: selectedBotIds,
                    label: formatBotSelectionLabel(selectedBotIds.length),
                  })
                }
              >
                <StopCircleIcon className="size-3.5" />
                Stop
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={isReadOnlyDemo || botActionMutation.isPending}
                onClick={() =>
                  botActionMutation.mutate({
                    kind: "reset-memory",
                    botIds: selectedBotIds,
                    label: formatBotSelectionLabel(selectedBotIds.length),
                  })
                }
              >
                <RotateCcwIcon className="size-3.5" />
                Reset Memory
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={isReadOnlyDemo || botActionMutation.isPending}
                onClick={() =>
                  botActionMutation.mutate({
                    kind: "release-claims",
                    botIds: selectedBotIds,
                    label: formatBotSelectionLabel(selectedBotIds.length),
                  })
                }
              >
                <WaypointsIcon className="size-3.5" />
                Release Claims
              </Button>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <InlineSelect
                label="Bulk enabled setting"
                value={bulkEnabledInput}
                options={[
                  { value: NO_CHANGE, label: "Enabled: No Change" },
                  { value: "enabled", label: "Enable" },
                  { value: "disabled", label: "Disable" },
                ]}
                onValueChange={setBulkEnabledInput}
              />
              <InlineSelect
                label="Bulk death recovery setting"
                value={bulkDeathRecoveryInput}
                options={[
                  {
                    value: NO_CHANGE,
                    label: "Death Recovery: No Change",
                  },
                  { value: "enabled", label: "Enable" },
                  { value: "disabled", label: "Disable" },
                ]}
                onValueChange={setBulkDeathRecoveryInput}
              />
              <InlineSelect
                label="Bulk role override setting"
                value={bulkRoleOverrideInput}
                options={[
                  { value: NO_CHANGE, label: "Role: No Change" },
                  ...roleOverrideOptions.map((option) => ({
                    value: String(option.value),
                    label: option.label,
                  })),
                ]}
                onValueChange={setBulkRoleOverrideInput}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={
                  isReadOnlyDemo ||
                  botSettingsMutation.isPending ||
                  !hasBulkSettingsPatch
                }
                onClick={() =>
                  botSettingsMutation.mutate({
                    botIds: selectedBotIds,
                    label: formatBotSelectionLabel(selectedBotIds.length),
                    patch: bulkSettingsPatch,
                  })
                }
              >
                Apply
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  bulkEnabledInput === NO_CHANGE &&
                  bulkDeathRecoveryInput === NO_CHANGE &&
                  bulkRoleOverrideInput === NO_CHANGE
                }
                onClick={() => {
                  setBulkEnabledInput(NO_CHANGE);
                  setBulkDeathRecoveryInput(NO_CHANGE);
                  setBulkRoleOverrideInput(NO_CHANGE);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        )}

        {filteredBots.length === 0 ? (
          <InlineEmptyState
            title={t("automation.filters.noBotsMatchTitle")}
            description={t("automation.filters.noBotsMatchDescription")}
            className="py-8"
          />
        ) : (
          <div className="divide-border overflow-hidden rounded-lg border divide-y">
            {filteredBots.map((bot) => (
              <BotRuntimeRow
                key={bot.botId}
                bot={bot}
                attention={
                  botAttentionById.get(bot.botId) ?? createHealthyBotAttention()
                }
                claimSummary={
                  botClaimSummaryById.get(bot.botId) ??
                  summarizeBotClaims(
                    bot,
                    [],
                    botAttentionById.get(bot.botId) ??
                      createHealthyBotAttention(),
                  )
                }
                selected={selectedBots[bot.botId] === true}
                disabled={isReadOnlyDemo}
                pending={
                  botActionMutation.isPending || botSettingsMutation.isPending
                }
                onSelectedChange={(checked) =>
                  setSelectedBots((current) => {
                    if (!checked) {
                      const next = { ...current };
                      delete next[bot.botId];
                      return next;
                    }
                    return {
                      ...current,
                      [bot.botId]: true,
                    };
                  })
                }
                onPauseResume={() =>
                  botActionMutation.mutate({
                    kind: bot.paused ? "resume" : "pause",
                    botIds: [bot.botId],
                    label: bot.accountName,
                  })
                }
                onStop={() =>
                  botActionMutation.mutate({
                    kind: "stop",
                    botIds: [bot.botId],
                    label: bot.accountName,
                  })
                }
                onResetMemory={() =>
                  botActionMutation.mutate({
                    kind: "reset-memory",
                    botIds: [bot.botId],
                    label: bot.accountName,
                  })
                }
                onReleaseClaims={() =>
                  botActionMutation.mutate({
                    kind: "release-claims",
                    botIds: [bot.botId],
                    label: bot.accountName,
                  })
                }
                onInspectMemory={() => {
                  setMemoryBotId(bot.botId);
                  setBottomTab("memory");
                }}
                onFocusClaims={() => {
                  setClaimFocusBotId(bot.botId);
                  setBottomTab("claims");
                }}
                onUpdateSettings={(patch) =>
                  botSettingsMutation.mutate({
                    botIds: [bot.botId],
                    label: bot.accountName,
                    patch,
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Bottom Tabbed Panel */}
      <Card size="sm" className="rounded-lg">
        <CardHeader className="pb-0">
          <ToggleGroup
            value={[bottomTab]}
            onValueChange={(value) => {
              const nextTab = value[0] as typeof bottomTab | undefined;
              if (nextTab) {
                setBottomTab(nextTab);
              }
            }}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <ToggleGroupItem value="health" className="flex-1">
              Health
            </ToggleGroupItem>
            <ToggleGroupItem value="claims" className="flex-1">
              Claims
            </ToggleGroupItem>
            <ToggleGroupItem value="memory" className="flex-1">
              Memory
            </ToggleGroupItem>
            <ToggleGroupItem value="intel" className="flex-1">
              Intel
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent className="pt-4">
          {bottomTab === "health" && (
            <HealthPanel
              entries={botAttentionEntries}
              criticalCount={attentionCounts.critical}
              warningCount={attentionCounts.warning}
              healthyCount={attentionCounts.healthy}
              attentionCount={attentionBotIds.length}
              pausableCriticalCount={criticalBotIds.length}
              resumablePausedCount={healthyPausedBotIds.length}
              isPending={botActionMutation.isPending}
              isReadOnlyDemo={isReadOnlyDemo}
              onInspectMemory={(botId) => {
                setMemoryBotId(botId);
                setBottomTab("memory");
              }}
              onFocusClaims={(botId) => {
                setClaimFocusBotId(botId);
                setBottomTab("claims");
              }}
              onSelectAttentionBots={() =>
                setSelectedBots(
                  Object.fromEntries(
                    attentionBotIds.map((botId) => [botId, true] as const),
                  ),
                )
              }
              onPauseCriticalBots={() =>
                botActionMutation.mutate({
                  kind: "pause",
                  botIds: criticalBotIds,
                  label: "Critical bots",
                })
              }
              onResumeHealthyPausedBots={() =>
                botActionMutation.mutate({
                  kind: "resume",
                  botIds: healthyPausedBotIds,
                  label: "Healthy paused bots",
                })
              }
              onSelectBot={(botId) =>
                setSelectedBots((current) => ({
                  ...current,
                  [botId]: true,
                }))
              }
            />
          )}
          {bottomTab === "claims" && (
            <ClaimsPanel
              claimSearch={claimSearch}
              ownerFilter={claimOwnerFilter}
              typeFilter={claimTypeFilter}
              ownerOptions={claimOwnerOptions}
              insights={filteredClaimInsights}
              counts={claimCounts}
              focusedBot={focusedClaimBot}
              isPending={claimMutation.isPending || botActionMutation.isPending}
              isReadOnlyDemo={isReadOnlyDemo}
              onClaimSearchChange={setClaimSearch}
              onOwnerFilterChange={setClaimOwnerFilter}
              onTypeFilterChange={setClaimTypeFilter}
              onClearFocus={() => setClaimFocusBotId("")}
              onFocusOwner={setClaimFocusBotId}
              onInspectOwnerMemory={(botId) => {
                setClaimFocusBotId(botId);
                setMemoryBotId(botId);
                setBottomTab("memory");
              }}
              onSelectOwner={(botId) =>
                setSelectedBots((current) => ({
                  ...current,
                  [botId]: true,
                }))
              }
              onReleaseClaim={(claimKey) => claimMutation.mutate(claimKey)}
              onReleaseOwnerClaims={(botId, accountName) =>
                botActionMutation.mutate({
                  kind: "release-claims",
                  botIds: [botId],
                  label: accountName,
                })
              }
            />
          )}
          {bottomTab === "memory" && (
            <MemoryPanel
              bots={teamState.bots}
              selectedBotId={memoryBotId}
              maxEntriesInput={memoryMaxEntriesInput}
              onBotIdChange={setMemoryBotId}
              onMaxEntriesInputChange={setMemoryMaxEntriesInput}
              memoryState={memoryStateQuery.data}
              isLoading={memoryStateQuery.isPending}
              isRefreshing={memoryStateQuery.isFetching}
              errorMessage={
                memoryStateQuery.error instanceof Error
                  ? memoryStateQuery.error.message
                  : memoryStateQuery.error
                    ? String(memoryStateQuery.error)
                    : null
              }
              resetDisabled={
                isReadOnlyDemo ||
                botActionMutation.isPending ||
                inspectedMemoryBot === undefined
              }
              onResetMemory={() => {
                if (inspectedMemoryBot === undefined) {
                  return;
                }

                botActionMutation.mutate({
                  kind: "reset-memory",
                  botIds: [inspectedMemoryBot.botId],
                  label: inspectedMemoryBot.accountName,
                });
              }}
            />
          )}
          {bottomTab === "intel" && (
            <IntelPanel coordinationState={coordinationState} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InlineSelect(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
}) {
  return (
    <Select
      items={props.options}
      value={props.value}
      onValueChange={(value) => {
        if (value) {
          props.onValueChange(value);
        }
      }}
    >
      <SelectTrigger aria-label={props.label} className="h-8 w-auto min-w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{props.label}</SelectLabel>
          {props.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function AutomationSettingsButton({ instanceId }: { instanceId: string }) {
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const hasAutomationSettingsPage = instanceInfo.instanceSettings.some(
    (page) => page.id === "automation",
  );

  if (!hasAutomationSettingsPage) {
    return null;
  }

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      nativeButton={false}
      render={
        <Link
          to="/instance/$instance/settings/$pageId"
          params={{
            instance: instanceId,
            pageId: "automation",
          }}
        />
      }
    >
      <Settings2Icon className="size-4" />
    </Button>
  );
}

function SettingToggle(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Item variant="outline" size="sm" className="items-start">
      <ItemContent>
        <ItemTitle>{props.label}</ItemTitle>
        <ItemDescription className="line-clamp-none text-xs">
          {props.description}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={props.checked}
          disabled={props.disabled}
          onCheckedChange={props.onCheckedChange}
        />
      </ItemActions>
    </Item>
  );
}

function SettingSelect(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onValueChange: (value: string) => void;
}) {
  const selectId = useId();

  return (
    <div className="grid gap-2">
      {props.label.length > 0 && (
        <label htmlFor={selectId} className="text-sm font-medium">
          {props.label}
        </label>
      )}
      <Select
        items={props.options}
        value={props.value}
        disabled={props.disabled}
        onValueChange={(value) => {
          if (value) {
            props.onValueChange(value);
          }
        }}
      >
        <SelectTrigger
          id={selectId}
          aria-label={props.label.length > 0 ? undefined : "Setting"}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {props.label.length > 0 && <SelectLabel>{props.label}</SelectLabel>}
            {props.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function BotRuntimeRow(props: {
  bot: AutomationBotState;
  attention: BotAttentionStatus;
  claimSummary: BotClaimSummary;
  selected: boolean;
  disabled: boolean;
  pending: boolean;
  onSelectedChange: (checked: boolean) => void;
  onPauseResume: () => void;
  onStop: () => void;
  onResetMemory: () => void;
  onReleaseClaims: () => void;
  onInspectMemory: () => void;
  onFocusClaims: () => void;
  onUpdateSettings: (patch: BotSettingsPatch) => void;
}) {
  const botSettings =
    props.bot.settings ?? create(AutomationBotSettingsSchema, {});
  const [draft, setDraft] = useState(() => createBotSettingsDraft(botSettings));
  const botSettingsPatch = useMemo(
    () => buildBotSettingsPatch(botSettings, draft),
    [botSettings, draft],
  );
  const hasSettingsChanges = Object.keys(botSettingsPatch).length > 0;
  const hasValidTuningInputs = botTuningNumberConfigs.every((config) =>
    isValidBotSettingInput(draft[config.key], config.min, config.max),
  );

  useEffect(() => {
    setDraft(createBotSettingsDraft(botSettings));
  }, [
    botSettings.allowDeathRecovery,
    botSettings.enabled,
    botSettings.memoryScanIntervalTicks,
    botSettings.memoryScanRadius,
    botSettings.retreatFoodThreshold,
    botSettings.retreatHealthThreshold,
    botSettings.roleOverride,
    botSettings,
  ]);

  return (
    <div className={cn("px-4 py-3", props.selected && "bg-primary/5")}>
      {/* Row 1: checkbox + name + badges + actions */}
      <div className="flex items-center gap-3">
        <Checkbox
          checked={props.selected}
          disabled={props.pending}
          onCheckedChange={(checked) =>
            props.onSelectedChange(checked === true)
          }
        />
        <span className="min-w-0 truncate font-medium">
          {props.bot.accountName}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {goalModeLabel(props.bot.goalMode)}
          </span>
          <span
            className={cn(
              "text-xs",
              props.bot.paused
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {props.bot.paused ? "Paused" : "Live"}
          </span>
          <span
            className={cn(
              "text-xs",
              props.attention.severity === "critical"
                ? "text-red-600 dark:text-red-400"
                : props.attention.severity === "warning"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {props.attention.label}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={props.disabled || props.pending}
                  onClick={props.onPauseResume}
                />
              }
            >
              {props.bot.paused ? (
                <PlayIcon className="size-3.5" />
              ) : (
                <PauseIcon className="size-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {props.bot.paused ? "Resume" : "Pause"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={props.disabled || props.pending}
                  onClick={props.onStop}
                />
              }
            >
              <StopCircleIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={props.disabled || props.pending}
                  onClick={props.onInspectMemory}
                />
              }
            >
              <BrainCircuitIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Inspect Memory</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={props.disabled || props.pending}
                  onClick={props.onResetMemory}
                />
              }
            >
              <RotateCcwIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Reset Memory</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={props.disabled || props.pending}
                  onClick={props.onFocusClaims}
                />
              }
            >
              <WaypointsIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              View Claims ({props.claimSummary.totalOwnedClaims})
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {/* Row 2: info line */}
      <div className="ml-7 mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        <span>{roleLabel(props.bot.teamRole)}</span>
        <span>
          {props.bot.beatPhase
            ? beatPhaseLabel(props.bot.beatPhase)
            : objectiveLabel(props.bot.teamObjective)}
        </span>
        <span>
          {dimensionLabel(
            normalizeBotDimension(props.bot.dimension || "unknown"),
          )}
        </span>
        <span className="tabular-nums">
          {formatPosition(props.bot.position)}
        </span>
        {props.bot.target && (
          <span>
            <CrosshairIcon className="mr-0.5 inline size-3" />
            {props.bot.target.displayName} x{props.bot.target.count}
          </span>
        )}
        {(props.bot.deathCount > 0 || props.bot.timeoutCount > 0) && (
          <span className="text-amber-600 dark:text-amber-400">
            {props.bot.deathCount}D / {props.bot.timeoutCount}TO
          </span>
        )}
        <span className="ml-auto">
          {props.bot.lastProgressAt ? (
            <>
              progress{" "}
              <SFTimeAgo date={timestampToDate(props.bot.lastProgressAt)} />
            </>
          ) : (
            "no progress data"
          )}
        </span>
      </div>
      {/* Collapsible details */}
      <Collapsible>
        <CollapsibleTrigger className="ml-7 mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRightIcon className="size-3 transition-transform [[data-state=open]_&]:rotate-90" />
          Details
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-7 mt-2 grid gap-3 text-xs">
            {/* Queued targets */}
            {props.bot.queuedTargets.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">Queued:</span>
                {props.bot.queuedTargets.map((target) => (
                  <Badge
                    key={`${target.requirementKey}:${target.count}`}
                    variant="secondary"
                    className="text-[11px]"
                  >
                    {target.displayName} x{target.count}
                  </Badge>
                ))}
              </div>
            )}

            {/* Health summary */}
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Health:</span>{" "}
              {props.attention.summary}
              {props.attention.operatorHint &&
                ` ${props.attention.operatorHint}`}
            </p>

            {/* Claims summary */}
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Claims:</span>{" "}
              {props.claimSummary.breakdown}
            </p>

            {/* Stats */}
            <p className="text-muted-foreground">
              Deaths {props.bot.deathCount} / Timeouts {props.bot.timeoutCount}{" "}
              / Recoveries {props.bot.recoveryCount}
              {props.bot.lastRecoveryReason &&
                ` / Last recovery: ${props.bot.lastRecoveryReason}`}
            </p>

            {/* Tuning */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRightIcon className="size-3 transition-transform [[data-state=open]_&]:rotate-90" />
                Automation Tuning
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 grid gap-3">
                  <SettingToggle
                    label="Automation Enabled"
                    description="Master switch for this bot."
                    checked={draft.enabled}
                    disabled={props.disabled || props.pending}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        enabled: checked,
                      }))
                    }
                  />
                  <SettingToggle
                    label="Death Recovery"
                    description="Recover dropped items after deaths."
                    checked={draft.allowDeathRecovery}
                    disabled={props.disabled || props.pending}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        allowDeathRecovery: checked,
                      }))
                    }
                  />
                  <SettingSelect
                    label="Role Override"
                    value={String(draft.roleOverride)}
                    options={roleOverrideOptions.map((option) => ({
                      value: String(option.value),
                      label: option.label,
                    }))}
                    disabled={props.disabled || props.pending}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        roleOverride: Number(value) as AutomationTeamRole,
                      }))
                    }
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {botTuningNumberConfigs.map((config) => (
                      <div key={config.key} className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <p className="min-w-0 truncate text-xs font-medium" />
                            }
                          >
                            {config.label}
                          </TooltipTrigger>
                          <TooltipContent>{config.description}</TooltipContent>
                        </Tooltip>
                        <Input
                          className="ml-auto h-7 w-16 text-xs"
                          type="number"
                          min={config.min}
                          max={config.max}
                          value={draft[config.key]}
                          disabled={props.disabled || props.pending}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [config.key]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={
                        props.disabled ||
                        props.pending ||
                        !hasValidTuningInputs ||
                        !hasSettingsChanges
                      }
                      onClick={() => props.onUpdateSettings(botSettingsPatch)}
                    >
                      Apply
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={
                        props.disabled || props.pending || !hasSettingsChanges
                      }
                      onClick={() =>
                        setDraft(createBotSettingsDraft(botSettings))
                      }
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function HealthPanel(props: {
  entries: BotAttentionEntry[];
  criticalCount: number;
  warningCount: number;
  healthyCount: number;
  attentionCount: number;
  pausableCriticalCount: number;
  resumablePausedCount: number;
  isPending: boolean;
  isReadOnlyDemo: boolean;
  onInspectMemory: (botId: string) => void;
  onFocusClaims: (botId: string) => void;
  onSelectAttentionBots: () => void;
  onPauseCriticalBots: () => void;
  onResumeHealthyPausedBots: () => void;
  onSelectBot: (botId: string) => void;
}) {
  const { t } = useTranslation("instance");
  const attentionEntries = props.entries.filter(
    (entry) => entry.attention.severity !== "ok",
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>
          <span className="font-medium text-red-600 dark:text-red-400">
            {props.criticalCount}
          </span>{" "}
          critical
        </span>
        <span>
          <span className="font-medium text-amber-600 dark:text-amber-400">
            {props.warningCount}
          </span>{" "}
          warning
        </span>
        <span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {props.healthyCount}
          </span>{" "}
          healthy
        </span>
        <div className="ml-auto flex gap-1.5">
          <Button
            size="xs"
            variant="outline"
            disabled={props.attentionCount === 0}
            onClick={props.onSelectAttentionBots}
          >
            Select Attention
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={
              props.isReadOnlyDemo ||
              props.isPending ||
              props.pausableCriticalCount === 0
            }
            onClick={props.onPauseCriticalBots}
          >
            Pause Critical
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={
              props.isReadOnlyDemo ||
              props.isPending ||
              props.resumablePausedCount === 0
            }
            onClick={props.onResumeHealthyPausedBots}
          >
            Resume Healthy Paused
          </Button>
        </div>
      </div>
      {attentionEntries.length === 0 ? (
        <InlineEmptyState title={t("automation.attention.empty")} />
      ) : (
        <ScrollArea className="h-72">
          <ItemGroup className="gap-0 divide-border divide-y">
            {attentionEntries.map((entry) => (
              <Item
                key={entry.bot.botId}
                size="sm"
                className="rounded-none border-0 px-0 py-3"
              >
                <ItemContent>
                  <ItemTitle className="w-full justify-between gap-3">
                    <span>{entry.bot.accountName}</span>
                    <span
                      className={cn(
                        "text-xs",
                        entry.attention.severity === "critical"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {entry.attention.label}
                    </span>
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none text-xs">
                    {entry.attention.summary}
                  </ItemDescription>
                  <ItemDescription className="line-clamp-none text-xs">
                    {entry.attention.operatorHint}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="basis-full justify-start">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => props.onInspectMemory(entry.bot.botId)}
                  >
                    Memory
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => props.onFocusClaims(entry.bot.botId)}
                  >
                    Claims
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => props.onSelectBot(entry.bot.botId)}
                  >
                    Select
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </ScrollArea>
      )}
    </div>
  );
}

function ClaimsPanel(props: {
  claimSearch: string;
  ownerFilter: string;
  typeFilter: string;
  ownerOptions: { value: string; label: string }[];
  insights: CoordinationClaimInsight[];
  counts: {
    total: number;
    block: number;
    entity: number;
    explore: number;
    explore3d: number;
    other: number;
    expiringSoon: number;
  };
  focusedBot: AutomationBotState | undefined;
  isPending: boolean;
  isReadOnlyDemo: boolean;
  onClaimSearchChange: (value: string) => void;
  onOwnerFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onClearFocus: () => void;
  onFocusOwner: (botId: string) => void;
  onInspectOwnerMemory: (botId: string) => void;
  onSelectOwner: (botId: string) => void;
  onReleaseClaim: (claimKey: string) => void;
  onReleaseOwnerClaims: (botId: string, accountName: string) => void;
}) {
  const { t } = useTranslation("instance");
  const focusedBot = props.focusedBot;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{props.counts.total} total</span>
        <span>{props.counts.block} block</span>
        <span>{props.counts.entity} entity</span>
        <span>{props.counts.explore + props.counts.explore3d} explore</span>
        <span>{props.counts.expiringSoon} expiring soon</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 max-w-48"
          placeholder={t("automation.filters.searchClaims")}
          value={props.claimSearch}
          onChange={(event) => props.onClaimSearchChange(event.target.value)}
        />
        <InlineSelect
          label="Claim owner filter"
          value={props.ownerFilter}
          options={[
            { value: "all", label: "All Owners" },
            ...props.ownerOptions,
          ]}
          onValueChange={props.onOwnerFilterChange}
        />
        <InlineSelect
          label="Claim type filter"
          value={props.typeFilter}
          options={[
            { value: "all", label: "All Claim Types" },
            { value: "block", label: "Block" },
            { value: "entity", label: "Entity" },
            { value: "explore", label: "Explore" },
            { value: "explore3d", label: "Explore 3D" },
            { value: "other", label: "Other" },
          ]}
          onValueChange={props.onTypeFilterChange}
        />
      </div>
      {focusedBot && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">Focused: {focusedBot.accountName}</span>
          <Button
            size="xs"
            variant="ghost"
            disabled={props.isReadOnlyDemo || props.isPending}
            onClick={() =>
              props.onReleaseOwnerClaims(
                focusedBot.botId,
                focusedBot.accountName,
              )
            }
          >
            Release Owner Claims
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => props.onInspectOwnerMemory(focusedBot.botId)}
          >
            Inspect Memory
          </Button>
          <Button size="xs" variant="ghost" onClick={props.onClearFocus}>
            Clear
          </Button>
        </div>
      )}
      {props.insights.length === 0 ? (
        <InlineEmptyState
          title={
            focusedBot
              ? `${focusedBot.accountName} does not currently own any claims matching the active filters.`
              : "No claims match the current filters."
          }
        />
      ) : (
        <ScrollArea className="h-72">
          <ItemGroup className="gap-0 divide-border divide-y">
            {props.insights.map((insight) => {
              const ownerBot = insight.ownerBot;
              return (
                <Item
                  key={insight.claim.key}
                  size="sm"
                  className="rounded-none border-0 px-0 py-2.5"
                >
                  <ItemContent className="min-w-0">
                    <ItemTitle className="truncate font-normal">
                      {insight.purposeLabel}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none text-xs">
                      {insight.kindLabel} /{" "}
                      {ownerBot?.accountName ?? insight.claim.ownerAccountName}{" "}
                      / {claimExpiryLabel(insight.expiresInSeconds)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="shrink-0">
                    {ownerBot && (
                      <>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => props.onFocusOwner(ownerBot.botId)}
                        >
                          Focus
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => props.onSelectOwner(ownerBot.botId)}
                        >
                          Select
                        </Button>
                      </>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={props.isReadOnlyDemo || props.isPending}
                      onClick={() => props.onReleaseClaim(insight.claim.key)}
                    >
                      Release
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        </ScrollArea>
      )}
    </div>
  );
}

function MemoryPanel(props: {
  bots: AutomationBotState[];
  selectedBotId: string;
  maxEntriesInput: string;
  onBotIdChange: (botId: string) => void;
  onMaxEntriesInputChange: (value: string) => void;
  memoryState: AutomationMemoryState | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  errorMessage: string | null;
  resetDisabled: boolean;
  onResetMemory: () => void;
}) {
  const { t } = useTranslation("instance");
  const selectedBot = props.bots.find(
    (bot) => bot.botId === props.selectedBotId,
  );
  const selectedBotId = selectedBot?.botId ?? props.bots[0]?.botId ?? "";
  const memoryState = props.memoryState;

  return (
    <div className="grid gap-3">
      {props.bots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <InlineSelect
            label="Memory bot"
            value={selectedBotId}
            options={props.bots.map((bot) => ({
              value: bot.botId,
              label: bot.accountName,
            }))}
            onValueChange={props.onBotIdChange}
          />
          <span className="text-xs text-muted-foreground">Depth</span>
          <Input
            className="h-7 w-14"
            type="number"
            min={1}
            max={32}
            value={props.maxEntriesInput}
            onChange={(event) =>
              props.onMaxEntriesInputChange(event.target.value)
            }
          />
          <Button
            size="xs"
            variant="ghost"
            disabled={props.resetDisabled}
            onClick={props.onResetMemory}
          >
            Reset
          </Button>
          {props.isRefreshing && (
            <span className="text-xs text-muted-foreground">Refreshing...</span>
          )}
        </div>
      )}

      {props.bots.length === 0 ? (
        <InlineEmptyState title={t("automation.memory.noBots")} />
      ) : props.errorMessage ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm">
          <p className="font-medium">Memory snapshot failed.</p>
          <p className="text-muted-foreground mt-1">{props.errorMessage}</p>
        </div>
      ) : props.isLoading || memoryState === undefined ? (
        <div className="grid gap-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {memoryState.rememberedBlockCount} blocks /{" "}
            {memoryState.rememberedContainerCount} containers /{" "}
            {memoryState.rememberedEntityCount} entities /{" "}
            {memoryState.rememberedDroppedItemCount} dropped /{" "}
            {memoryState.unreachablePositionCount} unreachable / tick{" "}
            {String(memoryState.tick)}
            {selectedBot && ` / ${selectedBot.accountName}`}
          </p>
          <ScrollArea className="h-[28rem]">
            <div className="grid gap-4">
              <MemorySectionHeading
                title={t("automation.memory.blocks")}
                count={memoryState.blocks.length}
              />
              {memoryState.blocks.length === 0 ? (
                <InlineEmptyState
                  title={t("automation.memory.noBlocks")}
                  className="py-2"
                />
              ) : (
                <ItemGroup className="gap-0 divide-border divide-y">
                  {memoryState.blocks.map((block) => (
                    <Item
                      key={`${block.x}:${block.y}:${block.z}:${block.blockId}`}
                      size="sm"
                      className="rounded-none border-0 px-0 py-2"
                    >
                      <ItemContent>
                        <ItemTitle className="truncate">
                          {formatNamespacedId(block.blockId)}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none text-xs">
                          {block.x}, {block.y}, {block.z} / Seen{" "}
                          {formatSeenTick(memoryState.tick, block.lastSeenTick)}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}

              <MemorySectionHeading
                title={t("automation.memory.containers")}
                count={memoryState.containers.length}
              />
              {memoryState.containers.length === 0 ? (
                <InlineEmptyState
                  title={t("automation.memory.noContainers")}
                  className="py-2"
                />
              ) : (
                <ItemGroup className="gap-0 divide-border divide-y">
                  {memoryState.containers.map((container) => (
                    <Item
                      key={`${container.x}:${container.y}:${container.z}:${container.blockId}`}
                      size="sm"
                      className="rounded-none border-0 px-0 py-2"
                    >
                      <ItemContent>
                        <ItemTitle className="truncate">
                          {formatNamespacedId(container.blockId)}
                          <span className="text-xs font-normal text-muted-foreground">
                            {container.inspected ? "Inspected" : "Unopened"}
                          </span>
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none text-xs">
                          {container.x}, {container.y}, {container.z} /{" "}
                          {container.distinctItemKinds} item kinds,{" "}
                          {container.totalItemCount} total items / Seen{" "}
                          {formatSeenTick(
                            memoryState.tick,
                            container.lastSeenTick,
                          )}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}

              <MemorySectionHeading
                title={t("automation.memory.entities")}
                count={memoryState.entities.length}
              />
              {memoryState.entities.length === 0 ? (
                <InlineEmptyState
                  title={t("automation.memory.noEntities")}
                  className="py-2"
                />
              ) : (
                <ItemGroup className="gap-0 divide-border divide-y">
                  {memoryState.entities.map((entity) => (
                    <Item
                      key={entity.entityId}
                      size="sm"
                      className="rounded-none border-0 px-0 py-2"
                    >
                      <ItemContent>
                        <ItemTitle className="truncate">
                          {formatNamespacedId(entity.entityType)}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none text-xs">
                          {formatPosition(entity.position)} / Entity{" "}
                          {shortId(entity.entityId)} / Seen{" "}
                          {formatSeenTick(
                            memoryState.tick,
                            entity.lastSeenTick,
                          )}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}

              <MemorySectionHeading
                title={t("automation.memory.droppedItems")}
                count={memoryState.droppedItems.length}
              />
              {memoryState.droppedItems.length === 0 ? (
                <InlineEmptyState
                  title={t("automation.memory.noDroppedItems")}
                  className="py-2"
                />
              ) : (
                <ItemGroup className="gap-0 divide-border divide-y">
                  {memoryState.droppedItems.map((item) => (
                    <Item
                      key={item.entityId}
                      size="sm"
                      className="rounded-none border-0 px-0 py-2"
                    >
                      <ItemContent>
                        <ItemTitle className="truncate">
                          {formatNamespacedId(item.itemId)} x{item.count}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none text-xs">
                          {formatPosition(item.position)} / Entity{" "}
                          {shortId(item.entityId)} / Seen{" "}
                          {formatSeenTick(memoryState.tick, item.lastSeenTick)}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}

              <MemorySectionHeading
                title={t("automation.memory.unreachablePositions")}
                count={memoryState.unreachablePositions.length}
              />
              {memoryState.unreachablePositions.length === 0 ? (
                <InlineEmptyState
                  title={t("automation.memory.noUnreachablePositions")}
                  className="py-2"
                />
              ) : (
                <ItemGroup className="gap-0 divide-border divide-y">
                  {memoryState.unreachablePositions.map((position) => (
                    <Item
                      key={`${position.x}:${position.y}:${position.z}:${position.untilTick}`}
                      size="sm"
                      className="rounded-none border-0 px-0 py-2"
                    >
                      <ItemContent>
                        <ItemTitle className="truncate">
                          {position.x}, {position.y}, {position.z}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none text-xs">
                          {formatUntilTick(
                            memoryState.tick,
                            position.untilTick,
                          )}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

function MemorySectionHeading(props: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between">
      <h4 className="text-sm font-medium">{props.title}</h4>
      <span className="text-xs text-muted-foreground">{props.count}</span>
    </div>
  );
}

function IntelPanel(props: { coordinationState: AutomationCoordinationState }) {
  const { t } = useTranslation("instance");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="text-sm font-medium mb-2">
          {t("automation.coordination.sharedBlocks")}
        </h4>
        {props.coordinationState.sharedBlocks.length === 0 ? (
          <InlineEmptyState title={t("automation.coordination.noBlockHints")} />
        ) : (
          <ScrollArea className="h-56">
            <ItemGroup className="gap-0 divide-border divide-y">
              {props.coordinationState.sharedBlocks.map((block) => (
                <Item
                  key={`${block.dimension}:${block.x}:${block.y}:${block.z}:${block.blockId}`}
                  size="sm"
                  className="rounded-none border-0 px-0 py-2"
                >
                  <ItemContent>
                    <ItemTitle className="truncate">{block.blockId}</ItemTitle>
                    <ItemDescription className="line-clamp-none text-xs">
                      {block.dimension} @ {block.x}, {block.y}, {block.z} / Seen
                      by {block.observerAccountName}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </ScrollArea>
        )}
      </div>
      <div>
        <h4 className="text-sm font-medium mb-2">
          {t("automation.coordination.eyeSamples")}
        </h4>
        {props.coordinationState.eyeSamples.length === 0 ? (
          <InlineEmptyState title={t("automation.coordination.noEyeSamples")} />
        ) : (
          <ScrollArea className="h-56">
            <ItemGroup className="gap-0 divide-border divide-y">
              {props.coordinationState.eyeSamples.map((sample) => (
                <Item
                  key={`${sample.botId}:${sample.recordedAt?.seconds ?? "0"}`}
                  size="sm"
                  className="rounded-none border-0 px-0 py-2"
                >
                  <ItemContent>
                    <ItemTitle className="truncate">
                      {sample.accountName}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none text-xs">
                      Origin {formatPosition(sample.origin)} / Direction{" "}
                      {formatPosition(sample.direction)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function createQuotaInputState(
  settings: AutomationInstanceSettings,
): Record<string, string> {
  return Object.fromEntries(
    quotaOverrideConfigs.map((config) => [
      config.requirementKey,
      String(config.readSetting(settings)),
    ]),
  );
}

function quotaOverrideConfig(requirementKey: string) {
  const config = quotaOverrideConfigs.find(
    (entry) => entry.requirementKey === requirementKey,
  );
  if (config === undefined) {
    throw new Error(`Unknown quota override target: ${requirementKey}`);
  }
  return config;
}

function isValidQuotaInput(value: string, min: number, max: number): boolean {
  if (value.trim().length === 0) {
    return false;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

function createBotSettingsDraft(
  settings: AutomationBotSettings,
): BotSettingsDraft {
  return {
    enabled: settings.enabled,
    allowDeathRecovery: settings.allowDeathRecovery,
    roleOverride: settings.roleOverride,
    memoryScanRadius: String(settings.memoryScanRadius),
    memoryScanIntervalTicks: String(settings.memoryScanIntervalTicks),
    retreatHealthThreshold: String(settings.retreatHealthThreshold),
    retreatFoodThreshold: String(settings.retreatFoodThreshold),
  };
}

function buildBotSettingsPatch(
  settings: AutomationBotSettings,
  draft: BotSettingsDraft,
): BotSettingsPatch {
  const patch: BotSettingsPatch = {};

  if (draft.enabled !== settings.enabled) {
    patch.enabled = draft.enabled;
  }
  if (draft.allowDeathRecovery !== settings.allowDeathRecovery) {
    patch.allowDeathRecovery = draft.allowDeathRecovery;
  }
  if (draft.roleOverride !== settings.roleOverride) {
    patch.roleOverride = draft.roleOverride;
  }
  if (Number(draft.memoryScanRadius) !== settings.memoryScanRadius) {
    patch.memoryScanRadius = Number(draft.memoryScanRadius);
  }
  if (
    Number(draft.memoryScanIntervalTicks) !== settings.memoryScanIntervalTicks
  ) {
    patch.memoryScanIntervalTicks = Number(draft.memoryScanIntervalTicks);
  }
  if (
    Number(draft.retreatHealthThreshold) !== settings.retreatHealthThreshold
  ) {
    patch.retreatHealthThreshold = Number(draft.retreatHealthThreshold);
  }
  if (Number(draft.retreatFoodThreshold) !== settings.retreatFoodThreshold) {
    patch.retreatFoodThreshold = Number(draft.retreatFoodThreshold);
  }

  return patch;
}

function isValidBotSettingInput(
  value: string,
  min: number,
  max: number,
): boolean {
  return isValidQuotaInput(value, min, max);
}

function normalizeBotDimension(dimension: string): string {
  return dimension.replace("minecraft:", "");
}

function dimensionLabel(dimension: string): string {
  return dimension
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatBotSelectionLabel(count: number): string {
  return `${count} selected bot${count === 1 ? "" : "s"}`;
}

function createHealthyBotAttention(): BotAttentionStatus {
  return {
    severity: "ok",
    label: "Healthy",
    summary: "Recent progress looks healthy.",
    reasons: ["Recent progress is within expected bounds."],
    operatorHint: "No intervention is suggested right now.",
  };
}

function describeBotAttention(
  bot: AutomationBotState,
  nowMs: number,
): BotAttentionStatus {
  const reasons: string[] = [];
  let severity: BotAttentionSeverity = "ok";
  const lastProgressAtMs = bot.lastProgressAt
    ? timestampToDate(bot.lastProgressAt).getTime()
    : null;
  const staleSeconds =
    lastProgressAtMs === null
      ? null
      : Math.max(0, Math.floor((nowMs - lastProgressAtMs) / 1000));

  const promote = (next: BotAttentionSeverity, reason: string) => {
    if (severityRank(next) > severityRank(severity)) {
      severity = next;
    }
    reasons.push(reason);
  };

  if (bot.paused) {
    promote("warning", "Paused by operator.");
  }
  if (bot.goalMode === AutomationGoalMode.IDLE && !bot.paused) {
    promote("warning", "No active automation goal.");
  }
  if (staleSeconds !== null && staleSeconds >= 180) {
    promote(
      "critical",
      `No progress for ${formatDurationSeconds(staleSeconds)}.`,
    );
  } else if (staleSeconds !== null && staleSeconds >= 75) {
    promote(
      "warning",
      `No progress for ${formatDurationSeconds(staleSeconds)}.`,
    );
  }
  if (bot.timeoutCount >= 3) {
    promote("critical", `${bot.timeoutCount} timeouts recorded.`);
  } else if (bot.timeoutCount >= 2) {
    promote("warning", `${bot.timeoutCount} timeouts recorded.`);
  }
  if (bot.deathCount >= 3) {
    promote("critical", `${bot.deathCount} deaths recorded.`);
  } else if (bot.deathCount >= 2) {
    promote("warning", `${bot.deathCount} deaths recorded.`);
  }
  if (!bot.currentAction && bot.queuedTargets.length > 0) {
    promote(
      "warning",
      `Queue has ${bot.queuedTargets.length} pending target${bot.queuedTargets.length === 1 ? "" : "s"} but no active action.`,
    );
  }
  if (
    bot.recoveryCount >= 3 &&
    severityRank(severity) < severityRank("critical")
  ) {
    promote("warning", `${bot.recoveryCount} recoveries attempted.`);
  }
  if (bot.lastRecoveryReason && (severity !== "ok" || bot.recoveryCount >= 3)) {
    reasons.push(`Last recovery: ${bot.lastRecoveryReason}.`);
  }

  if (reasons.length === 0) {
    return createHealthyBotAttention();
  }

  return {
    severity,
    label: attentionLabel(bot, severity, staleSeconds),
    summary: reasons[0] ?? "Needs attention.",
    reasons,
    operatorHint: attentionOperatorHint(bot, severity, staleSeconds),
  };
}

function severityRank(severity: BotAttentionSeverity): number {
  switch (severity) {
    case "critical":
      return 2;
    case "warning":
      return 1;
    default:
      return 0;
  }
}

function compareBotAttentionEntries(
  left: BotAttentionEntry,
  right: BotAttentionEntry,
): number {
  const severityDelta =
    severityRank(right.attention.severity) -
    severityRank(left.attention.severity);
  if (severityDelta !== 0) {
    return severityDelta;
  }
  return left.bot.accountName.localeCompare(right.bot.accountName);
}

function matchesBotAttentionFilter(
  attention: BotAttentionStatus,
  filter: string,
): boolean {
  switch (filter) {
    case "attention":
      return attention.severity !== "ok";
    case "critical":
      return attention.severity === "critical";
    case "healthy":
      return attention.severity === "ok";
    default:
      return true;
  }
}

function _attentionBadgeClassName(severity: BotAttentionSeverity): string {
  switch (severity) {
    case "critical":
      return "border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
    default:
      return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
}

function attentionLabel(
  bot: AutomationBotState,
  severity: BotAttentionSeverity,
  staleSeconds: number | null,
): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "warning":
      if (bot.paused) {
        return "Paused";
      }
      if (staleSeconds !== null && staleSeconds >= 75) {
        return "Stalled";
      }
      return "Warning";
    default:
      return "Healthy";
  }
}

function attentionOperatorHint(
  bot: AutomationBotState,
  severity: BotAttentionSeverity,
  staleSeconds: number | null,
): string {
  if (bot.paused) {
    return "Resume only if the pause was intentional and the team is ready for this bot again.";
  }
  if (bot.goalMode === AutomationGoalMode.IDLE) {
    return "Start beat or acquire automation before expecting further progress.";
  }
  if (severity === "critical" && (staleSeconds ?? 0) >= 180) {
    return "Inspect memory, release claims, or reset memory if the bot is looping on stale world state.";
  }
  if (severity === "critical" && bot.timeoutCount >= 3) {
    return "This bot is repeatedly timing out; inspect memory first and consider pausing it if the team is thrashing.";
  }
  if (severity === "critical" && bot.deathCount >= 3) {
    return "Repeated deaths suggest bad local conditions; pause or retune this bot before it burns more shared resources.";
  }
  if (!bot.currentAction && bot.queuedTargets.length > 0) {
    return "Queued work exists without an active action; inspect memory and claim state for missing context.";
  }
  return "Inspect the bot memory snapshot before forcing broader team-wide interventions.";
}

function formatDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function describeCoordinationClaim(
  claim: AutomationCoordinationClaim,
  botById: Map<string, AutomationBotState>,
  nowMs: number,
): CoordinationClaimInsight {
  const parts = claim.key.split(":");
  const kind = parseCoordinationClaimKind(parts[0] ?? "");
  const purpose =
    kind === "explore" || kind === "explore3d"
      ? (parts[2] ?? "")
      : (parts[1] ?? "");
  const expiresInSeconds = claim.expiresAt
    ? Math.floor((timestampToDate(claim.expiresAt).getTime() - nowMs) / 1000)
    : null;
  const ownerBot = botById.get(claim.ownerBotId);
  return {
    claim,
    kind,
    kindLabel: coordinationClaimKindLabel(kind),
    purpose,
    purposeLabel: formatClaimPurposeLabel(purpose),
    ownerBot,
    expiresInSeconds,
    expiringSoon:
      expiresInSeconds !== null &&
      expiresInSeconds >= 0 &&
      expiresInSeconds <= 15,
    searchText: [
      claim.key,
      claim.ownerAccountName,
      ownerBot?.accountName ?? "",
      formatPosition(claim.target),
      formatClaimPurposeLabel(purpose),
      coordinationClaimKindLabel(kind),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function parseCoordinationClaimKind(raw: string): CoordinationClaimKind {
  switch (raw) {
    case "block":
    case "entity":
    case "explore":
    case "explore3d":
      return raw;
    default:
      return "other";
  }
}

function coordinationClaimKindLabel(kind: CoordinationClaimKind): string {
  switch (kind) {
    case "block":
      return "Block";
    case "entity":
      return "Entity";
    case "explore":
      return "Explore";
    case "explore3d":
      return "Explore 3D";
    default:
      return "Other";
  }
}

function formatClaimPurposeLabel(purpose: string): string {
  if (purpose.trim().length === 0) {
    return "General";
  }

  return purpose
    .split(/[-_]/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function compareCoordinationClaimInsights(
  left: CoordinationClaimInsight,
  right: CoordinationClaimInsight,
): number {
  const expiryDelta =
    (left.expiresInSeconds ?? Number.MAX_SAFE_INTEGER) -
    (right.expiresInSeconds ?? Number.MAX_SAFE_INTEGER);
  if (expiryDelta !== 0) {
    return expiryDelta;
  }
  return left.claim.key.localeCompare(right.claim.key);
}

function summarizeBotClaims(
  _bot: AutomationBotState,
  ownedClaims: CoordinationClaimInsight[],
  attention: BotAttentionStatus,
): BotClaimSummary {
  if (ownedClaims.length === 0) {
    return {
      ownedClaims,
      totalOwnedClaims: 0,
      expiringSoonCount: 0,
      breakdown: "No active coordinator reservations.",
      note:
        attention.severity === "ok"
          ? "This bot is progressing without holding any shared claims right now."
          : "This bot is degraded without holding shared claims, so investigate memory, planner state, or teammate reservations next.",
    };
  }

  const byKind = ownedClaims.reduce<Record<string, number>>((counts, claim) => {
    counts[claim.kindLabel] = (counts[claim.kindLabel] ?? 0) + 1;
    return counts;
  }, {});
  const breakdown = Object.entries(byKind)
    .map(([label, count]) => `${count} ${label.toLowerCase()}`)
    .join(", ");
  const expiringSoonCount = ownedClaims.filter(
    (claim) => claim.expiringSoon,
  ).length;

  return {
    ownedClaims,
    totalOwnedClaims: ownedClaims.length,
    expiringSoonCount,
    breakdown: `${ownedClaims.length} active claim${ownedClaims.length === 1 ? "" : "s"}: ${breakdown}.`,
    note:
      expiringSoonCount > 0
        ? `${expiringSoonCount} claim${expiringSoonCount === 1 ? "" : "s"} expires soon, so ownership may reshuffle without manual intervention.`
        : attention.severity === "ok"
          ? "This bot currently owns shared work reservations."
          : "This bot is degraded while still holding shared claims; focus them before broader resets so the team does not thrash.",
  };
}

function claimExpiryLabel(expiresInSeconds: number | null): string {
  if (expiresInSeconds === null) {
    return "No expiry";
  }
  if (expiresInSeconds < 0) {
    return "Expired";
  }
  return `Expires in ${formatDurationSeconds(expiresInSeconds)}`;
}

function isHealthyPausedResumeCandidate(bot: AutomationBotState): boolean {
  if (!bot.paused) {
    return false;
  }
  if (bot.goalMode === AutomationGoalMode.IDLE) {
    return false;
  }
  if (!bot.settings?.enabled) {
    return false;
  }
  if (bot.timeoutCount >= 3 || bot.deathCount >= 3 || bot.recoveryCount >= 4) {
    return false;
  }
  return (
    bot.currentAction !== undefined ||
    bot.queuedTargets.length > 0 ||
    bot.target !== undefined
  );
}

function goalModeLabel(mode: AutomationGoalMode): string {
  switch (mode) {
    case AutomationGoalMode.ACQUIRE:
      return "Acquire";
    case AutomationGoalMode.BEAT:
      return "Beat";
    default:
      return "Idle";
  }
}

function beatPhaseLabel(phase: number): string {
  switch (phase) {
    case 1:
      return "Prepare Overworld";
    case 2:
      return "Enter Nether";
    case 3:
      return "Nether Collection";
    case 4:
      return "Return to Overworld";
    case 5:
      return "Stronghold Search";
    case 6:
      return "Activate Portal";
    case 7:
      return "End Fight";
    case 8:
      return "Complete";
    default:
      return "Unknown";
  }
}

function presetLabel(preset: AutomationPreset): string {
  return (
    presetOptions.find((option) => option.value === preset)?.label ?? "Unknown"
  );
}

function objectiveLabel(objective: AutomationTeamObjective): string {
  return (
    objectiveOptions.find((option) => option.value === objective)?.label ??
    "Unknown"
  );
}

function roleLabel(role: AutomationTeamRole): string {
  return (
    roleOverrideOptions.find((option) => option.value === role)?.label ??
    "Unknown"
  );
}

function formatPosition(
  position: { x?: number; y?: number; z?: number } | undefined,
): string {
  if (
    position?.x === undefined ||
    position?.y === undefined ||
    position?.z === undefined
  ) {
    return "Unknown";
  }

  return `${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)}`;
}

function formatNamespacedId(value: string): string {
  return value.startsWith("minecraft:")
    ? value.slice("minecraft:".length)
    : value;
}

function shortId(value: string): string {
  return value.length <= 8 ? value : value.slice(0, 8);
}

function formatSeenTick(
  currentTick: bigint | number,
  seenTick: bigint | number,
): string {
  const current = Number(currentTick);
  const seen = Number(seenTick);
  const delta = Math.max(0, current - seen);
  return delta === 0
    ? "this tick"
    : `${delta} tick${delta === 1 ? "" : "s"} ago`;
}

function formatUntilTick(
  currentTick: bigint | number,
  untilTick: bigint | number,
): string {
  const current = Number(currentTick);
  const until = Number(untilTick);
  if (until <= current) {
    return "Expired but still cached.";
  }

  const delta = until - current;
  return `Avoid for ${delta} more tick${delta === 1 ? "" : "s"}.`;
}

function createDemoAutomationTeamState(
  instanceId: string,
): AutomationTeamState {
  const now = new Date();
  return create(AutomationTeamStateSchema, {
    instanceId,
    friendlyName: "Demo Automation",
    settings: {
      preset: AutomationPreset.BALANCED_TEAM,
      teamCollaboration: true,
      rolePolicy: AutomationRolePolicy.STATIC_TEAM,
      sharedEndEntry: true,
      maxEndBots: 2,
      sharedStructureIntel: true,
      sharedTargetClaims: true,
      objectiveOverride: AutomationTeamObjective.UNSPECIFIED,
      targetBlazeRods: 0,
      targetEnderPearls: 0,
      targetEnderEyes: 0,
      targetArrows: 0,
      targetBeds: 0,
    },
    objective: AutomationTeamObjective.STRONGHOLD_HUNT,
    activeBots: 3,
    quotas: [
      {
        requirementKey: "blaze_rod",
        displayName: "Blaze Rod",
        currentCount: 6,
        targetCount: 8,
      },
      {
        requirementKey: "ender_pearl",
        displayName: "Ender Pearl",
        currentCount: 11,
        targetCount: 14,
      },
      {
        requirementKey: "ender_eye",
        displayName: "Ender Eye",
        currentCount: 9,
        targetCount: 12,
      },
      {
        requirementKey: "arrow",
        displayName: "Arrow",
        currentCount: 48,
        targetCount: 64,
      },
      {
        requirementKey: "any_bed",
        displayName: "Any Bed",
        currentCount: 2,
        targetCount: 2,
      },
    ],
    bots: [
      {
        instanceId,
        botId: "11111111-1111-1111-1111-111111111111",
        accountName: "PortalLead",
        statusSummary: "moving to stronghold estimate",
        goalMode: AutomationGoalMode.BEAT,
        teamRole: AutomationTeamRole.LEAD,
        teamObjective: AutomationTeamObjective.STRONGHOLD_HUNT,
        beatPhase: 5,
        currentAction: "following eye of ender",
        dimension: "minecraft:overworld",
        position: { x: 1412, y: 73, z: -288 },
        deathCount: 0,
        timeoutCount: 1,
        recoveryCount: 1,
        lastRecoveryReason: "resetting after death",
        lastProgressAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) - 20),
          nanos: 0,
        }),
        settings: {
          enabled: true,
          allowDeathRecovery: true,
          memoryScanRadius: 48,
          memoryScanIntervalTicks: 20,
          retreatHealthThreshold: 8,
          retreatFoodThreshold: 12,
          roleOverride: AutomationTeamRole.UNSPECIFIED,
        },
        queuedTargets: [
          { requirementKey: "ender_eye", displayName: "Ender Eye", count: 3 },
        ],
      },
      {
        instanceId,
        botId: "22222222-2222-2222-2222-222222222222",
        accountName: "FortressScout",
        statusSummary: "stalled near fortress perimeter",
        goalMode: AutomationGoalMode.BEAT,
        teamRole: AutomationTeamRole.NETHER_RUNNER,
        teamObjective: AutomationTeamObjective.STRONGHOLD_HUNT,
        beatPhase: 3,
        currentAction: "approaching fortress",
        dimension: "minecraft:the_nether",
        position: { x: -132, y: 68, z: 244 },
        deathCount: 1,
        timeoutCount: 3,
        recoveryCount: 3,
        lastRecoveryReason: "recovering death drops",
        lastProgressAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) - 205),
          nanos: 0,
        }),
        settings: {
          enabled: true,
          allowDeathRecovery: true,
          memoryScanRadius: 48,
          memoryScanIntervalTicks: 20,
          retreatHealthThreshold: 8,
          retreatFoodThreshold: 12,
          roleOverride: AutomationTeamRole.UNSPECIFIED,
        },
        queuedTargets: [
          { requirementKey: "blaze_rod", displayName: "Blaze Rod", count: 2 },
          {
            requirementKey: "ender_pearl",
            displayName: "Ender Pearl",
            count: 3,
          },
        ],
      },
      {
        instanceId,
        botId: "33333333-3333-3333-3333-333333333333",
        accountName: "EndSupport",
        statusSummary: "automation paused",
        goalMode: AutomationGoalMode.BEAT,
        paused: true,
        teamRole: AutomationTeamRole.END_SUPPORT,
        teamObjective: AutomationTeamObjective.STRONGHOLD_HUNT,
        beatPhase: 5,
        dimension: "minecraft:overworld",
        position: { x: 1398, y: 66, z: -254 },
        deathCount: 0,
        timeoutCount: 0,
        recoveryCount: 0,
        settings: {
          enabled: true,
          allowDeathRecovery: true,
          memoryScanRadius: 56,
          memoryScanIntervalTicks: 16,
          retreatHealthThreshold: 12,
          retreatFoodThreshold: 14,
          roleOverride: AutomationTeamRole.END_SUPPORT,
        },
        queuedTargets: [
          { requirementKey: "arrow", displayName: "Arrow", count: 16 },
        ],
      },
    ],
  });
}

function createDemoAutomationCoordinationState(
  instanceId: string,
): AutomationCoordinationState {
  const now = new Date();
  return create(AutomationCoordinationStateSchema, {
    instanceId,
    friendlyName: "Demo Automation",
    settings: {
      preset: AutomationPreset.BALANCED_TEAM,
      teamCollaboration: true,
      rolePolicy: AutomationRolePolicy.STATIC_TEAM,
      sharedEndEntry: true,
      maxEndBots: 2,
      sharedStructureIntel: true,
      sharedTargetClaims: true,
      objectiveOverride: AutomationTeamObjective.UNSPECIFIED,
      targetBlazeRods: 0,
      targetEnderPearls: 0,
      targetEnderEyes: 0,
      targetArrows: 0,
      targetBeds: 0,
    },
    objective: AutomationTeamObjective.STRONGHOLD_HUNT,
    activeBots: 3,
    sharedBlockCount: 7,
    claimCount: 3,
    eyeSampleCount: 2,
    sharedCounts: [
      {
        requirementKey: "blaze_rod",
        displayName: "Blaze Rod",
        currentCount: 6,
        targetCount: 8,
      },
      {
        requirementKey: "ender_pearl",
        displayName: "Ender Pearl",
        currentCount: 11,
        targetCount: 14,
      },
    ],
    sharedBlocks: [
      {
        observerBotId: "22222222-2222-2222-2222-222222222222",
        observerAccountName: "FortressScout",
        dimension: "minecraft:the_nether",
        x: -118,
        y: 70,
        z: 236,
        blockId: "minecraft:nether_bricks",
        lastSeenAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) - 30),
          nanos: 0,
        }),
      },
      {
        observerBotId: "11111111-1111-1111-1111-111111111111",
        observerAccountName: "PortalLead",
        dimension: "minecraft:overworld",
        x: 1407,
        y: 34,
        z: -301,
        blockId: "minecraft:end_portal_frame",
        lastSeenAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) - 15),
          nanos: 0,
        }),
      },
    ],
    claims: [
      {
        key: "block:portal-frame:minecraft:overworld:3829201281",
        ownerBotId: "11111111-1111-1111-1111-111111111111",
        ownerAccountName: "PortalLead",
        target: { x: 1407, y: 34, z: -301 },
        expiresAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) + 20),
          nanos: 0,
        }),
      },
      {
        key: "explore3d:minecraft:the_nether:nether-fortress:-192:192:0:1:12",
        ownerBotId: "22222222-2222-2222-2222-222222222222",
        ownerAccountName: "FortressScout",
        target: { x: -191.5, y: 80, z: 288.5 },
        expiresAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) + 40),
          nanos: 0,
        }),
      },
      {
        key: "entity:blaze:7d83543f-5f51-4f0b-97d4-49c31b187d77",
        ownerBotId: "22222222-2222-2222-2222-222222222222",
        ownerAccountName: "FortressScout",
        expiresAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) + 12),
          nanos: 0,
        }),
      },
    ],
    eyeSamples: [
      {
        botId: "11111111-1111-1111-1111-111111111111",
        accountName: "PortalLead",
        origin: { x: 1200, y: 72, z: -420 },
        direction: { x: 0.84, y: 0, z: -0.54 },
        recordedAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) - 90),
          nanos: 0,
        }),
      },
      {
        botId: "33333333-3333-3333-3333-333333333333",
        accountName: "EndSupport",
        origin: { x: 1324, y: 68, z: -310 },
        direction: { x: 0.62, y: 0, z: -0.78 },
        recordedAt: create(TimestampSchema, {
          seconds: BigInt(Math.floor(now.getTime() / 1000) - 75),
          nanos: 0,
        }),
      },
    ],
  });
}

function createDemoAutomationMemoryState(
  instanceId: string,
  botId: string,
  accountName: string,
  maxEntries: number,
): AutomationMemoryState {
  const baseTick = 214_580;

  switch (botId) {
    case "22222222-2222-2222-2222-222222222222":
      return create(AutomationMemoryStateSchema, {
        instanceId,
        botId,
        accountName,
        tick: BigInt(baseTick),
        rememberedBlockCount: 18,
        rememberedContainerCount: 2,
        rememberedEntityCount: 3,
        rememberedDroppedItemCount: 1,
        unreachablePositionCount: 2,
        blocks: [
          {
            x: -118,
            y: 70,
            z: 236,
            blockId: "minecraft:nether_bricks",
            lastSeenTick: BigInt(baseTick - 6),
          },
          {
            x: -104,
            y: 74,
            z: 219,
            blockId: "minecraft:blaze_spawner",
            lastSeenTick: BigInt(baseTick - 12),
          },
        ].slice(0, maxEntries),
        containers: [
          {
            x: -121,
            y: 68,
            z: 232,
            blockId: "minecraft:chest",
            inspected: true,
            distinctItemKinds: 3,
            totalItemCount: 9,
            lastSeenTick: BigInt(baseTick - 18),
          },
        ].slice(0, maxEntries),
        entities: [
          {
            entityId: "cafe0000-0000-0000-0000-000000000001",
            entityType: "minecraft:blaze",
            position: { x: -106, y: 74, z: 221 },
            lastSeenTick: BigInt(baseTick - 3),
          },
          {
            entityId: "cafe0000-0000-0000-0000-000000000002",
            entityType: "minecraft:wither_skeleton",
            position: { x: -130, y: 69, z: 244 },
            lastSeenTick: BigInt(baseTick - 14),
          },
        ].slice(0, maxEntries),
        droppedItems: [
          {
            entityId: "cafe0000-0000-0000-0000-000000000003",
            itemId: "minecraft:blaze_rod",
            count: 1,
            position: { x: -108, y: 74, z: 220 },
            lastSeenTick: BigInt(baseTick - 8),
          },
        ].slice(0, maxEntries),
        unreachablePositions: [
          {
            x: -140,
            y: 67,
            z: 252,
            untilTick: BigInt(baseTick + 40),
          },
        ].slice(0, maxEntries),
      });
    case "33333333-3333-3333-3333-333333333333":
      return create(AutomationMemoryStateSchema, {
        instanceId,
        botId,
        accountName,
        tick: BigInt(baseTick),
        rememberedBlockCount: 9,
        rememberedContainerCount: 1,
        rememberedEntityCount: 1,
        rememberedDroppedItemCount: 0,
        unreachablePositionCount: 1,
        blocks: [
          {
            x: 1394,
            y: 65,
            z: -252,
            blockId: "minecraft:oak_planks",
            lastSeenTick: BigInt(baseTick - 4),
          },
          {
            x: 1388,
            y: 65,
            z: -246,
            blockId: "minecraft:white_bed",
            lastSeenTick: BigInt(baseTick - 11),
          },
        ].slice(0, maxEntries),
        containers: [
          {
            x: 1392,
            y: 65,
            z: -250,
            blockId: "minecraft:chest",
            inspected: false,
            distinctItemKinds: 0,
            totalItemCount: 0,
            lastSeenTick: BigInt(baseTick - 11),
          },
        ].slice(0, maxEntries),
        entities: [
          {
            entityId: "cafe0000-0000-0000-0000-000000000004",
            entityType: "minecraft:villager",
            position: { x: 1389, y: 65, z: -248 },
            lastSeenTick: BigInt(baseTick - 13),
          },
        ].slice(0, maxEntries),
        unreachablePositions: [
          {
            x: 1406,
            y: 34,
            z: -301,
            untilTick: BigInt(baseTick + 12),
          },
        ].slice(0, maxEntries),
      });
    default:
      return create(AutomationMemoryStateSchema, {
        instanceId,
        botId,
        accountName,
        tick: BigInt(baseTick),
        rememberedBlockCount: 15,
        rememberedContainerCount: 2,
        rememberedEntityCount: 2,
        rememberedDroppedItemCount: 1,
        unreachablePositionCount: 1,
        blocks: [
          {
            x: 1407,
            y: 34,
            z: -301,
            blockId: "minecraft:end_portal_frame",
            lastSeenTick: BigInt(baseTick - 5),
          },
          {
            x: 1412,
            y: 73,
            z: -288,
            blockId: "minecraft:stone_bricks",
            lastSeenTick: BigInt(baseTick - 10),
          },
        ].slice(0, maxEntries),
        containers: [
          {
            x: 1415,
            y: 72,
            z: -285,
            blockId: "minecraft:chest",
            inspected: true,
            distinctItemKinds: 4,
            totalItemCount: 17,
            lastSeenTick: BigInt(baseTick - 14),
          },
        ].slice(0, maxEntries),
        entities: [
          {
            entityId: "cafe0000-0000-0000-0000-000000000005",
            entityType: "minecraft:enderman",
            position: { x: 1418, y: 72, z: -280 },
            lastSeenTick: BigInt(baseTick - 9),
          },
        ].slice(0, maxEntries),
        droppedItems: [
          {
            entityId: "cafe0000-0000-0000-0000-000000000006",
            itemId: "minecraft:ender_eye",
            count: 2,
            position: { x: 1410, y: 72, z: -287 },
            lastSeenTick: BigInt(baseTick - 16),
          },
        ].slice(0, maxEntries),
        unreachablePositions: [
          {
            x: 1411,
            y: 33,
            z: -297,
            untilTick: BigInt(baseTick + 20),
          },
        ].slice(0, maxEntries),
      });
  }
}
