import { create } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import {
  BotConnectionPhase,
  BotDesiredState,
  type BotListResponse,
  BotListResponseSchema,
  BotRuntimeState,
} from "@soulfiremc/sdk/generated/soulfire/bot_pb";
import type { ClientDataResponse } from "@soulfiremc/sdk/generated/soulfire/client_pb";
import {
  GlobalPermission,
  type SettingsDefinition,
  type SettingsPage,
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import { smartEntries } from "@/lib/utils.tsx";

export const demoClientData = {
  id: "00000000-0000-0000-0000-000000000000",
  username: "root",
  role: 0,
  email: "root@soulfiremc.com",
  serverPermissions: smartEntries(GlobalPermission).map((permission) => ({
    globalPermission: permission[1],
    granted: true,
  })),
  serverInfo: {
    version: "DEMO",
    commitHash: "DEMO",
    branchName: "DEMO",
    publicApiAddress: "https://demo.soulfiremc.com",
    publicWebdavAddress: "https://demo.soulfiremc.com/webdav",
    publicDocsAddress: "https://demo.soulfiremc.com/docs",
    publicMcpAddress: "https://demo.soulfiremc.com/mcp",
    minecraftVersion: "1.21.11",
  },
} as ClientDataResponse;

export const demoBotList = create(BotListResponseSchema, {
  bots: [
    {
      profileId: "607d30e7-115b-3838-914a-e4229c2b985d",
      isOnline: true,
      connectionPhase: BotConnectionPhase.SPAWNED,
      accountName: "Pistonmaster",
      status: {
        profileId: "607d30e7-115b-3838-914a-e4229c2b985d",
        desiredState: BotDesiredState.RUNNING,
        runtimeState: BotRuntimeState.RUNNING,
        updatedAt: create(TimestampSchema, {
          seconds: 0n,
          nanos: 0,
        }),
      },
    },
  ],
}) satisfies BotListResponse;

export const demoInstanceSettings = [
  {
    id: "bot",
    pageName: "Bot Settings",
    entries: [
      { namespace: "bot", key: "address" },
      { namespace: "bot", key: "join-delay" },
      { namespace: "bot", key: "protocol-version" },
      { namespace: "bot", key: "read-timeout" },
      { namespace: "bot", key: "write-timeout" },
      { namespace: "bot", key: "connect-timeout" },
      { namespace: "bot", key: "resolve-srv" },
      { namespace: "bot", key: "concurrent-connects" },
      { namespace: "bot", key: "restore-on-reboot" },
      { namespace: "bot", key: "ignore-packet-handling-errors" },
    ],
    iconId: "triangle-alert",
  },
  {
    id: "account",
    pageName: "Account Settings",
    entries: [
      { namespace: "account", key: "shuffle-accounts" },
      { namespace: "account", key: "use-proxies-for-account-auth" },
      { namespace: "account", key: "account-import-concurrency" },
    ],
    iconId: "triangle-alert",
  },
  {
    id: "proxy",
    pageName: "Proxy Settings",
    entries: [
      { namespace: "proxy", key: "bots-per-proxy" },
      { namespace: "proxy", key: "shuffle-proxies" },
      { namespace: "proxy", key: "proxy-check-address" },
      { namespace: "proxy", key: "proxy-check-concurrency" },
    ],
    iconId: "triangle-alert",
  },
  {
    id: "ai",
    pageName: "AI Settings",
    entries: [
      { namespace: "ai", key: "api-base-url" },
      { namespace: "ai", key: "api-key" },
      { namespace: "ai", key: "api-request-timeout" },
      { namespace: "ai", key: "api-max-retries" },
    ],
    iconId: "triangle-alert",
  },
  {
    id: "pathfinding",
    pageName: "Pathfinding Settings",
    entries: [
      { namespace: "pathfinding", key: "allow-breaking-undiggable" },
      { namespace: "pathfinding", key: "avoid-diagonal-squeeze" },
      { namespace: "pathfinding", key: "avoid-harmful-entities" },
      { namespace: "pathfinding", key: "max-enemy-penalty" },
      { namespace: "pathfinding", key: "break-block-penalty" },
      { namespace: "pathfinding", key: "place-block-penalty" },
      { namespace: "pathfinding", key: "expire-timeout" },
      { namespace: "pathfinding", key: "disable-pruning" },
    ],
    iconId: "triangle-alert",
  },
  {
    id: "chat-logger",
    pageName: "Chat Logger",
    entries: [
      { namespace: "chat-logger", key: "enabled" },
      { namespace: "chat-logger", key: "log-death-messages" },
      { namespace: "chat-logger", key: "deduplicate-amount" },
    ],
    iconId: "logs",
    owningPluginId: "chat-logger",
    enabledIdentifier: { namespace: "chat-logger", key: "enabled" },
  },
  {
    id: "disconnect-logger",
    pageName: "Disconnect Logger",
    entries: [
      { namespace: "disconnect-logger", key: "enabled" },
      { namespace: "disconnect-logger", key: "deduplicate-amount" },
    ],
    iconId: "logs",
    owningPluginId: "disconnect-logger",
    enabledIdentifier: { namespace: "disconnect-logger", key: "enabled" },
  },
] as SettingsPage[];
export const demoInstanceSettingsDefinitions = [
  {
    scope: 1,
    type: {
      case: "string",
      value: {
        uiName: "Address",
        description: "Address to connect to",
        def: "127.0.0.1:25565",
        inputType: 0,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "address" },
  },
  {
    scope: 1,
    type: {
      case: "minMax",
      value: {
        min: 0,
        max: 2147483647,
        step: 1,
        thousandSeparator: true,
        disabled: false,
        minEntry: {
          uiName: "Min Join Delay (ms)",
          description: "Minimum delay between joins in milliseconds",
          def: 1000,
          placeholder: "",
        },
        maxEntry: {
          uiName: "Max Join Delay (ms)",
          description: "Maximum delay between joins in milliseconds",
          def: 3000,
          placeholder: "",
        },
      },
    },
    id: { namespace: "bot", key: "join-delay" },
  },
  {
    scope: 1,
    type: {
      case: "combo",
      value: {
        uiName: "Protocol Version",
        description: "Minecraft protocol version to use",
        options: [
          {
            id: "SPECIAL|898",
            displayName: "Bedrock 1.21.130 (Work in progress)",
            keywords: ["Bedrock 1.21.130", "898"],
            iconId: "brick-wall",
          },
          {
            id: "RELEASE|774",
            displayName: "1.21.11",
            keywords: ["1.21.11", "774"],
            iconId: "box",
          },
          {
            id: "RELEASE|773",
            displayName: "1.21.9-1.21.10",
            keywords: ["1.21.9", "1.21.10", "773"],
            iconId: "box",
          },
          {
            id: "RELEASE|772",
            displayName: "1.21.7-1.21.8",
            keywords: ["1.21.7", "1.21.8", "772"],
            iconId: "box",
          },
          {
            id: "RELEASE|771",
            displayName: "1.21.6",
            keywords: ["1.21.6", "771"],
            iconId: "box",
          },
          {
            id: "SPECIAL|1073742068",
            displayName: "25w14craftmine",
            keywords: ["25w14craftmine", "1073742068"],
            iconId: "ghost",
          },
          {
            id: "RELEASE|770",
            displayName: "1.21.5",
            keywords: ["1.21.5", "770"],
            iconId: "box",
          },
          {
            id: "RELEASE|769",
            displayName: "1.21.4",
            keywords: ["1.21.4", "769"],
            iconId: "box",
          },
          {
            id: "RELEASE|768",
            displayName: "1.21.2-1.21.3",
            keywords: ["1.21.2", "1.21.3", "768"],
            iconId: "box",
          },
          {
            id: "RELEASE|767",
            displayName: "1.21-1.21.1",
            keywords: ["1.21", "1.21.0", "1.21.1", "767"],
            iconId: "box",
          },
          {
            id: "RELEASE|766",
            displayName: "1.20.5-1.20.6",
            keywords: ["1.20.5", "1.20.6", "766"],
            iconId: "box",
          },
          {
            id: "RELEASE|765",
            displayName: "1.20.3-1.20.4",
            keywords: ["1.20.3", "1.20.4", "765"],
            iconId: "box",
          },
          {
            id: "RELEASE|764",
            displayName: "1.20.2",
            keywords: ["1.20.2", "764"],
            iconId: "box",
          },
          {
            id: "RELEASE|763",
            displayName: "1.20-1.20.1",
            keywords: ["1.20", "1.20.0", "1.20.1", "763"],
            iconId: "box",
          },
          {
            id: "RELEASE|762",
            displayName: "1.19.4",
            keywords: ["1.19.4", "762"],
            iconId: "box",
          },
          {
            id: "RELEASE|761",
            displayName: "1.19.3",
            keywords: ["1.19.3", "761"],
            iconId: "box",
          },
          {
            id: "RELEASE|760",
            displayName: "1.19.1-1.19.2",
            keywords: ["1.19.1", "1.19.2", "760"],
            iconId: "box",
          },
          {
            id: "RELEASE|759",
            displayName: "1.19",
            keywords: ["1.19", "759"],
            iconId: "box",
          },
          {
            id: "RELEASE|758",
            displayName: "1.18.2",
            keywords: ["1.18.2", "758"],
            iconId: "box",
          },
          {
            id: "RELEASE|757",
            displayName: "1.18-1.18.1",
            keywords: ["1.18", "1.18.0", "1.18.1", "757"],
            iconId: "box",
          },
          {
            id: "RELEASE|756",
            displayName: "1.17.1",
            keywords: ["1.17.1", "756"],
            iconId: "box",
          },
          {
            id: "RELEASE|755",
            displayName: "1.17",
            keywords: ["1.17", "755"],
            iconId: "box",
          },
          {
            id: "RELEASE|754",
            displayName: "1.16.4-1.16.5",
            keywords: ["1.16.4", "1.16.5", "754"],
            iconId: "box",
          },
          {
            id: "RELEASE|753",
            displayName: "1.16.3",
            keywords: ["1.16.3", "753"],
            iconId: "box",
          },
          {
            id: "RELEASE|751",
            displayName: "1.16.2",
            keywords: ["1.16.2", "751"],
            iconId: "box",
          },
          {
            id: "SPECIAL|803",
            displayName: "Combat Test 8c",
            keywords: ["Combat Test 8c", "803"],
            iconId: "ghost",
          },
          {
            id: "RELEASE|736",
            displayName: "1.16.1",
            keywords: ["1.16.1", "736"],
            iconId: "box",
          },
          {
            id: "RELEASE|735",
            displayName: "1.16",
            keywords: ["1.16", "735"],
            iconId: "box",
          },
          {
            id: "SPECIAL|709",
            displayName: "20w14infinite",
            keywords: ["20w14infinite", "709"],
            iconId: "ghost",
          },
          {
            id: "RELEASE|578",
            displayName: "1.15.2",
            keywords: ["1.15.2", "578"],
            iconId: "box",
          },
          {
            id: "RELEASE|575",
            displayName: "1.15.1",
            keywords: ["1.15.1", "575"],
            iconId: "box",
          },
          {
            id: "RELEASE|573",
            displayName: "1.15",
            keywords: ["1.15", "573"],
            iconId: "box",
          },
          {
            id: "RELEASE|498",
            displayName: "1.14.4",
            keywords: ["1.14.4", "498"],
            iconId: "box",
          },
          {
            id: "RELEASE|490",
            displayName: "1.14.3",
            keywords: ["1.14.3", "490"],
            iconId: "box",
          },
          {
            id: "RELEASE|485",
            displayName: "1.14.2",
            keywords: ["1.14.2", "485"],
            iconId: "box",
          },
          {
            id: "RELEASE|480",
            displayName: "1.14.1",
            keywords: ["1.14.1", "480"],
            iconId: "box",
          },
          {
            id: "RELEASE|477",
            displayName: "1.14",
            keywords: ["1.14", "477"],
            iconId: "box",
          },
          {
            id: "SPECIAL|1",
            displayName: "3D Shareware",
            keywords: ["3D Shareware", "1"],
            iconId: "ghost",
          },
          {
            id: "RELEASE|404",
            displayName: "1.13.2",
            keywords: ["1.13.2", "404"],
            iconId: "box",
          },
          {
            id: "RELEASE|401",
            displayName: "1.13.1",
            keywords: ["1.13.1", "401"],
            iconId: "box",
          },
          {
            id: "RELEASE|393",
            displayName: "1.13",
            keywords: ["1.13", "393"],
            iconId: "box",
          },
          {
            id: "RELEASE|340",
            displayName: "1.12.2",
            keywords: ["1.12.2", "340"],
            iconId: "box",
          },
          {
            id: "RELEASE|338",
            displayName: "1.12.1",
            keywords: ["1.12.1", "338"],
            iconId: "box",
          },
          {
            id: "RELEASE|335",
            displayName: "1.12",
            keywords: ["1.12", "335"],
            iconId: "box",
          },
          {
            id: "RELEASE|316",
            displayName: "1.11.1-1.11.2",
            keywords: ["1.11.1", "1.11.2", "316"],
            iconId: "box",
          },
          {
            id: "RELEASE|315",
            displayName: "1.11",
            keywords: ["1.11", "315"],
            iconId: "box",
          },
          {
            id: "RELEASE|210",
            displayName: "1.10.x",
            keywords: ["1.10", "1.10.0", "1.10.1", "1.10.2", "210"],
            iconId: "box",
          },
          {
            id: "RELEASE|110",
            displayName: "1.9.3-1.9.4",
            keywords: ["1.9.3", "1.9.4", "110"],
            iconId: "box",
          },
          {
            id: "RELEASE|109",
            displayName: "1.9.2",
            keywords: ["1.9.2", "109"],
            iconId: "box",
          },
          {
            id: "RELEASE|108",
            displayName: "1.9.1",
            keywords: ["1.9.1", "108"],
            iconId: "box",
          },
          {
            id: "RELEASE|107",
            displayName: "1.9",
            keywords: ["1.9", "107"],
            iconId: "box",
          },
          {
            id: "RELEASE|47",
            displayName: "1.8.x",
            keywords: [
              "1.8",
              "1.8.0",
              "1.8.1",
              "1.8.2",
              "1.8.3",
              "1.8.4",
              "1.8.5",
              "1.8.6",
              "1.8.7",
              "1.8.8",
              "1.8.9",
              "47",
            ],
            iconId: "box",
          },
          {
            id: "RELEASE|5",
            displayName: "1.7.6-1.7.10",
            keywords: ["1.7.6", "1.7.7", "1.7.8", "1.7.9", "1.7.10", "5"],
            iconId: "box",
          },
          {
            id: "RELEASE|4",
            displayName: "1.7.2-1.7.5",
            keywords: ["1.7.2", "1.7.3", "1.7.4", "1.7.5", "4"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|78",
            displayName: "1.6.4",
            keywords: ["1.6.4", "78"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|74",
            displayName: "1.6.2",
            keywords: ["1.6.2", "74"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|73",
            displayName: "1.6.1",
            keywords: ["1.6.1", "73"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|61",
            displayName: "1.5.2",
            keywords: ["1.5.2", "61"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|60",
            displayName: "1.5-1.5.1",
            keywords: ["1.5", "1.5.0", "1.5.1", "60"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|51",
            displayName: "1.4.6-1.4.7",
            keywords: ["1.4.6", "1.4.7", "51"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|49",
            displayName: "1.4.4-1.4.5",
            keywords: ["1.4.4", "1.4.5", "49"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|47",
            displayName: "1.4.2",
            keywords: ["1.4.2", "47"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|39",
            displayName: "1.3.1-1.3.2",
            keywords: ["1.3.1", "1.3.2", "39"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|29",
            displayName: "1.2.4-1.2.5",
            keywords: ["1.2.4", "1.2.5", "29"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|28",
            displayName: "1.2.1-1.2.3",
            keywords: ["1.2.1", "1.2.2", "1.2.3", "28"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|23",
            displayName: "1.1",
            keywords: ["1.1", "23"],
            iconId: "box",
          },
          {
            id: "RELEASE_INITIAL|22",
            displayName: "1.0.0-1.0.1",
            keywords: ["1.0", "1.0.0", "1.0.1", "22"],
            iconId: "box",
          },
          {
            id: "BETA_LATER|17",
            displayName: "b1.8-b1.8.1",
            keywords: ["b1.8", "b1.8.0", "b1.8.1", "17"],
            iconId: "test-tube",
          },
          {
            id: "BETA_LATER|14",
            displayName: "b1.7-b1.7.3",
            keywords: ["b1.7", "b1.7.0", "b1.7.1", "b1.7.2", "b1.7.3", "14"],
            iconId: "test-tube",
          },
          {
            id: "BETA_LATER|13",
            displayName: "b1.6-b1.6.6",
            keywords: [
              "b1.6",
              "b1.6.0",
              "b1.6.1",
              "b1.6.2",
              "b1.6.3",
              "b1.6.4",
              "b1.6.5",
              "b1.6.6",
              "13",
            ],
            iconId: "test-tube",
          },
          {
            id: "BETA_LATER|11",
            displayName: "b1.5-b1.5.2",
            keywords: ["b1.5", "b1.5.0", "b1.5.1", "b1.5.2", "11"],
            iconId: "test-tube",
          },
          {
            id: "BETA_LATER|10",
            displayName: "b1.4-b1.4.1",
            keywords: ["b1.4", "b1.4.0", "b1.4.1", "10"],
            iconId: "test-tube",
          },
          {
            id: "BETA_LATER|9",
            displayName: "b1.3-b1.3.1",
            keywords: ["b1.3", "b1.3.0", "b1.3.1", "9"],
            iconId: "test-tube",
          },
          {
            id: "BETA_LATER|8",
            displayName: "b1.2-b1.2.2",
            keywords: ["b1.2", "b1.2.0", "b1.2.1", "b1.2.2", "8"],
            iconId: "test-tube",
          },
          {
            id: "BETA_INITIAL|8",
            displayName: "b1.1.2",
            keywords: ["b1.1.2", "8"],
            iconId: "test-tube",
          },
          {
            id: "BETA_INITIAL|7",
            displayName: "b1.0-b1.1.1",
            keywords: ["b1.0", "b1.0.0", "b1.0.1", "7"],
            iconId: "test-tube",
          },
          {
            id: "ALPHA_LATER|6",
            displayName: "a1.2.3.5-a1.2.6",
            keywords: ["a1.2.3.5", "a1.2.3.6", "6"],
            iconId: "flask-conical",
          },
          {
            id: "ALPHA_LATER|5",
            displayName: "a1.2.3-a1.2.3.4",
            keywords: [
              "a1.2.3",
              "a1.2.3.0",
              "a1.2.3.1",
              "a1.2.3.2",
              "a1.2.3.3",
              "a1.2.3.4",
              "5",
            ],
            iconId: "flask-conical",
          },
          {
            id: "ALPHA_LATER|4",
            displayName: "a1.2.2",
            keywords: ["a1.2.2", "4"],
            iconId: "flask-conical",
          },
          {
            id: "ALPHA_LATER|3",
            displayName: "a1.2.0-a1.2.1.1",
            keywords: ["a1.2", "a1.2.0", "a1.2.1", "3"],
            iconId: "flask-conical",
          },
          {
            id: "ALPHA_LATER|2",
            displayName: "a1.1.0-a1.1.2.1",
            keywords: ["a1.1", "a1.1.0", "a1.1.1", "a1.1.2", "2"],
            iconId: "flask-conical",
          },
          {
            id: "ALPHA_LATER|1",
            displayName: "a1.0.17-a1.0.17.4",
            keywords: [
              "a1.0.17",
              "a1.0.17.0",
              "a1.0.17.1",
              "a1.0.17.2",
              "a1.0.17.3",
              "a1.0.17.4",
              "1",
            ],
            iconId: "flask-conical",
          },
          {
            id: "ALPHA_INITIAL|14",
            displayName: "a1.0.16-a1.0.16.2",
            keywords: ["a1.0.16", "a1.0.16.0", "a1.0.16.1", "a1.0.16.2", "14"],
            iconId: "flask-conical",
          },
          {
            id: "ALPHA_INITIAL|13",
            displayName: "a1.0.15",
            keywords: ["a1.0.15", "13"],
            iconId: "flask-conical",
          },
          {
            id: "SPECIAL|7",
            displayName: "c0.30 CPE",
            keywords: ["c0.30 CPE", "7"],
            iconId: "archive",
          },
          {
            id: "CLASSIC|7",
            displayName: "c0.28-c0.30",
            keywords: ["c0.28-c0.30", "7"],
            iconId: "archive",
          },
          {
            id: "CLASSIC|6",
            displayName: "c0.0.20a-c0.27",
            keywords: ["c0.0.20a-c0.27", "6"],
            iconId: "archive",
          },
          {
            id: "CLASSIC|5",
            displayName: "c0.0.19a-06",
            keywords: ["c0.0.19a-06", "5"],
            iconId: "archive",
          },
          {
            id: "CLASSIC|4",
            displayName: "c0.0.18a-02",
            keywords: ["c0.0.18a-02", "4"],
            iconId: "archive",
          },
          {
            id: "CLASSIC|3",
            displayName: "c0.0.16a-02",
            keywords: ["c0.0.16a-02", "3"],
            iconId: "archive",
          },
          {
            id: "CLASSIC|0",
            displayName: "c0.0.15a-1",
            keywords: ["c0.0.15a-1", "0"],
            iconId: "archive",
          },
        ],
        def: "RELEASE|774",
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "protocol-version" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "Read Timeout",
        description: "Read timeout in seconds",
        def: 30,
        min: 0,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "read-timeout" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "Write Timeout",
        description: "Write timeout in seconds",
        def: 0,
        min: 0,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "write-timeout" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "Connect Timeout",
        description: "Connect timeout in seconds",
        def: 30,
        min: 0,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "connect-timeout" },
  },
  {
    scope: 1,
    type: {
      case: "bool",
      value: {
        uiName: "Resolve SRV",
        description: "Try to resolve SRV records from the address",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "resolve-srv" },
  },
  {
    scope: 1,
    type: {
      case: "int",
      value: {
        uiName: "Concurrent Connects",
        description: "Max amount of bots attempting to connect at once",
        def: 1,
        min: 1,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "concurrent-connects" },
  },
  {
    scope: 2,
    type: {
      case: "bool",
      value: {
        uiName: "Restore on Reboot",
        description:
          "Reconnect this bot when SoulFire starts if it was previously desired to be running.",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "restore-on-reboot" },
  },
  {
    scope: 2,
    type: {
      case: "bool",
      value: {
        uiName: "Ignore Packet Handling Errors",
        description:
          'Sometimes a bot fails to process a packet. When that happens it disconnects due to "packet errors".\nWhen this option is turned on, SoulFire will ignore errors during the packet handling process and keep bots connected.\nThis might cause bots to have inconsistent world state though, so it could be detected by the server.',
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "bot", key: "ignore-packet-handling-errors" },
  },
  {
    scope: 1,
    type: {
      case: "bool",
      value: {
        uiName: "Shuffle accounts",
        description:
          "This setting randomizes account order before bots connect.",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "account", key: "shuffle-accounts" },
  },
  {
    scope: 1,
    type: {
      case: "bool",
      value: {
        uiName: "Use proxies for account auth",
        description:
          "SoulFire uses imported proxies for account authentication.\nOtherwise, the SoulFire server connects directly.",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "account", key: "use-proxies-for-account-auth" },
  },
  {
    scope: 1,
    type: {
      case: "int",
      value: {
        uiName: "Account import concurrency",
        description:
          "SoulFire imports no more than this number of accounts at the same time when authentication requires credentials.",
        def: 3,
        min: 1,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "account", key: "account-import-concurrency" },
  },
  {
    scope: 1,
    type: {
      case: "int",
      value: {
        uiName: "Bots per proxy",
        description: "Amount of bots that can be on a single proxy",
        def: -1,
        min: -1,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "proxy", key: "bots-per-proxy" },
  },
  {
    scope: 1,
    type: {
      case: "bool",
      value: {
        uiName: "Shuffle proxies",
        description: "This setting randomizes proxy order before bots connect.",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "proxy", key: "shuffle-proxies" },
  },
  {
    scope: 1,
    type: {
      case: "string",
      value: {
        uiName: "Proxy check address",
        description:
          "What Minecraft server address to use to check if a proxy is working",
        def: "mc.hypixel.net",
        inputType: 0,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "proxy", key: "proxy-check-address" },
  },
  {
    scope: 1,
    type: {
      case: "int",
      value: {
        uiName: "Proxy check concurrency",
        description: "Amount of proxies to check at the same time",
        def: 10,
        min: 1,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "proxy", key: "proxy-check-concurrency" },
  },
  {
    scope: 1,
    type: {
      case: "int",
      value: {
        uiName: "Proxy check timeout",
        description:
          "How long to wait for a proxy check response before considering it failed (seconds)",
        def: 30,
        min: 1,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "proxy", key: "proxy-check-timeout" },
  },
  {
    scope: 2,
    type: {
      case: "string",
      value: {
        uiName: "API Base URL",
        description:
          "API server base URL, can also be changed to other providers",
        def: "https://api.openai.com/v1",
        inputType: 0,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "ai", key: "api-base-url" },
  },
  {
    scope: 2,
    type: {
      case: "string",
      value: {
        uiName: "API Key",
        description: "API key or none if using a custom provider",
        def: "",
        inputType: 1,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "ai", key: "api-key" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "API Request Timeout",
        description: "API request timeout (seconds)",
        def: 60,
        min: 0,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "ai", key: "api-request-timeout" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "API Max Retries",
        description: "API request max retries",
        def: 5,
        min: 0,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "ai", key: "api-max-retries" },
  },
  {
    scope: 2,
    type: {
      case: "bool",
      value: {
        uiName: "Allow Breaking Undiggable",
        description:
          "Allow the bot to attempt breaking blocks that are normally undiggable (like bedrock)",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "pathfinding", key: "allow-breaking-undiggable" },
  },
  {
    scope: 2,
    type: {
      case: "bool",
      value: {
        uiName: "Avoid Diagonal Squeeze",
        description:
          "Prevent the bot from squeezing through diagonal gaps between blocks",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "pathfinding", key: "avoid-diagonal-squeeze" },
  },
  {
    scope: 2,
    type: {
      case: "bool",
      value: {
        uiName: "Avoid Harmful Entities",
        description:
          "Add a penalty to paths that go near harmful entities like hostile mobs",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "pathfinding", key: "avoid-harmful-entities" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "Max Enemy Penalty",
        description:
          "Maximum cost penalty applied when pathfinding near hostile entities",
        def: 50,
        min: 0,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "pathfinding", key: "max-enemy-penalty" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "Break Block Penalty",
        description:
          "Cost penalty for breaking a block during pathfinding (higher values discourage breaking)",
        def: 2,
        min: 0,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "pathfinding", key: "break-block-penalty" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "Place Block Penalty",
        description:
          "Cost penalty for placing a block during pathfinding (higher values discourage placing)",
        def: 5,
        min: 0,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "pathfinding", key: "place-block-penalty" },
  },
  {
    scope: 2,
    type: {
      case: "int",
      value: {
        uiName: "Expire Timeout",
        description: "Maximum time in seconds before pathfinding gives up",
        def: 180,
        min: 1,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "pathfinding", key: "expire-timeout" },
  },
  {
    scope: 2,
    type: {
      case: "bool",
      value: {
        uiName: "Disable Pruning",
        description:
          "This setting disables periodic pruning of the pathfinding search space. It can increase memory use.",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "pathfinding", key: "disable-pruning" },
  },
  {
    scope: 1,
    type: {
      case: "bool",
      value: {
        uiName: "Log chat to terminal",
        description: "Log all received chat messages to the terminal",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "chat-logger", key: "enabled" },
  },
  {
    scope: 1,
    type: {
      case: "bool",
      value: {
        uiName: "Additionally log death messages to terminal",
        description: "Log all death messages to the terminal",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "chat-logger", key: "log-death-messages" },
  },
  {
    scope: 1,
    type: {
      case: "int",
      value: {
        uiName: "Deduplicate amount",
        description:
          "SoulFire logs the same message no more than this number of times within five seconds.",
        def: 1,
        min: 1,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "chat-logger", key: "deduplicate-amount" },
  },
  {
    scope: 1,
    type: {
      case: "bool",
      value: {
        uiName: "Log disconnects to terminal",
        description: "Log all bot disconnects to the terminal",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "disconnect-logger", key: "enabled" },
  },
  {
    scope: 1,
    type: {
      case: "int",
      value: {
        uiName: "Deduplicate amount",
        description:
          "SoulFire logs the same disconnect message no more than this number of times within five seconds.",
        def: 1,
        min: 1,
        max: 2147483647,
        step: 1,
        placeholder: "",
        thousandSeparator: true,
        disabled: false,
      },
    },
    id: { namespace: "disconnect-logger", key: "deduplicate-amount" },
  },
] as SettingsDefinition[];

export const demoServerSettings = [
  {
    id: "server",
    pageName: "Server Settings",
    entries: [
      { namespace: "server", key: "public-address" },
      { namespace: "server", key: "allow-creating-instances" },
      { namespace: "server", key: "allow-updating-self-username" },
      { namespace: "server", key: "allow-updating-self-email" },
      { namespace: "server", key: "allow-deleting-instances" },
      { namespace: "server", key: "allow-changing-instance-meta" },
      { namespace: "server", key: "allow-instance-scripts" },
      { namespace: "server", key: "email-type" },
      { namespace: "server", key: "smtp-host" },
      { namespace: "server", key: "smtp-port" },
      { namespace: "server", key: "smtp-username" },
      { namespace: "server", key: "smtp-password" },
      { namespace: "server", key: "smtp-type" },
      { namespace: "server", key: "smtp-from" },
    ],
    iconId: "triangle-alert",
  },
  {
    id: "dev",
    pageName: "Developer Settings",
    entries: [
      { namespace: "dev", key: "soulfire-debug" },
      { namespace: "dev", key: "minecraft-debug" },
      { namespace: "dev", key: "netty-debug" },
      { namespace: "dev", key: "grpc-debug" },
      { namespace: "dev", key: "hibernate-debug" },
      { namespace: "dev", key: "via-debug" },
      { namespace: "dev", key: "other-debug" },
    ],
    iconId: "triangle-alert",
  },
] as SettingsPage[];
export const demoServerSettingsDefinitions = [
  {
    scope: 0,
    type: {
      case: "string",
      value: {
        uiName: "Public address",
        description:
          "The address clients on the internet use to connect to this SoulFire instance.\nUsed for links in E-Mails and WebDAV.",
        def: "http://127.0.0.1:38765",
        inputType: 0,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "server", key: "public-address" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Allow creating instances",
        description: "Allow (non-admin) users to create instances.",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "server", key: "allow-creating-instances" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Allow updating self username",
        description: "Allow (non-admin) users to change their username.",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "server", key: "allow-updating-self-username" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Allow updating self email",
        description: "Allow (non-admin) users to change their email.",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "server", key: "allow-updating-self-email" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Allow deleting instances",
        description: "Allow the owner of an instance to delete it.",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "server", key: "allow-deleting-instances" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Allow changing instance meta",
        description:
          "Allow the owner of an instance to change meta like instance name and icon.",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "server", key: "allow-changing-instance-meta" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Allow instance scripts",
        description:
          "Allow users of instances to create custom instance-level scripts.",
        def: true,
        disabled: false,
      },
    },
    id: { namespace: "server", key: "allow-instance-scripts" },
  },
  {
    scope: 0,
    type: {
      case: "combo",
      value: {
        uiName: "Email Type",
        description: "SoulFire uses this method to deliver emails.",
        options: [
          {
            id: "CONSOLE",
            displayName: "Console",
            keywords: [],
            iconId: "logs",
          },
          { id: "SMTP", displayName: "SMTP", keywords: [], iconId: "mails" },
        ],
        def: "CONSOLE",
        disabled: false,
      },
    },
    id: { namespace: "server", key: "email-type" },
  },
  {
    scope: 0,
    type: {
      case: "string",
      value: {
        uiName: "SMTP Host",
        description: "SMTP server host to use for sending emails.",
        def: "smtp.gmail.com",
        inputType: 0,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "server", key: "smtp-host" },
  },
  {
    scope: 0,
    type: {
      case: "int",
      value: {
        uiName: "SMTP Port",
        description: "SMTP server port to use for sending emails.",
        def: 587,
        min: 1,
        max: 65535,
        step: 1,
        placeholder: "",
        thousandSeparator: false,
        disabled: false,
      },
    },
    id: { namespace: "server", key: "smtp-port" },
  },
  {
    scope: 0,
    type: {
      case: "string",
      value: {
        uiName: "SMTP Username",
        description: "Username to use for SMTP authentication.",
        def: "",
        inputType: 0,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "server", key: "smtp-username" },
  },
  {
    scope: 0,
    type: {
      case: "string",
      value: {
        uiName: "SMTP Password",
        description: "Password to use for SMTP authentication.",
        def: "",
        inputType: 1,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "server", key: "smtp-password" },
  },
  {
    scope: 0,
    type: {
      case: "combo",
      value: {
        uiName: "SMTP Type",
        description: "Type of encryption to use for SMTP.",
        options: [
          {
            id: "STARTTLS",
            displayName: "STARTTLS",
            keywords: [],
            iconId: "shield-check",
          },
          {
            id: "SSL_TLS",
            displayName: "SSL/TLS",
            keywords: [],
            iconId: "shield",
          },
          {
            id: "NONE",
            displayName: "None",
            keywords: [],
            iconId: "shield-off",
          },
        ],
        def: "STARTTLS",
        disabled: false,
      },
    },
    id: { namespace: "server", key: "smtp-type" },
  },
  {
    scope: 0,
    type: {
      case: "string",
      value: {
        uiName: "SMTP From",
        description: "Email address to use as sender for emails.",
        def: "soulfire@gmail.com",
        inputType: 0,
        placeholder: "",
        minLength: 0,
        maxLength: 2147483647,
        pattern: ".*",
        disabled: false,
      },
    },
    id: { namespace: "server", key: "smtp-from" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "SoulFire debug",
        description: "Enable SoulFire debug logging",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "dev", key: "soulfire-debug" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Minecraft debug",
        description: "Enable Minecraft debug logging",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "dev", key: "minecraft-debug" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Netty debug",
        description: "Enable Netty debug logging",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "dev", key: "netty-debug" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "gRPC debug",
        description: "Enable gRPC debug logging",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "dev", key: "grpc-debug" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Hibernate debug",
        description: "Enable Hibernate debug logging",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "dev", key: "hibernate-debug" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Via debug",
        description: "Enable Via* debug logging",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "dev", key: "via-debug" },
  },
  {
    scope: 0,
    type: {
      case: "bool",
      value: {
        uiName: "Other debug",
        description: "Enable other debug logging",
        def: false,
        disabled: false,
      },
    },
    id: { namespace: "dev", key: "other-debug" },
  },
] as SettingsDefinition[];
