import { createRequire } from "node:module";

export interface DiscordRpcClient {
  login: () => Promise<void>;
  on: (event: "disconnected", handler: () => void) => void;
  readonly user:
    | {
        setActivity: (activity: Record<string, unknown>) => Promise<unknown>;
      }
    | undefined;
}

const require = createRequire(__filename);
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- @xhayper/discord-rpc is loaded with require so its types are declared here
const DiscordRpc = require("@xhayper/discord-rpc") as {
  Client: new (options: { clientId: string }) => DiscordRpcClient;
};

const CLIENT_ID = "1248603974475583608";

export class DiscordPresenceManager {
  private readonly client: DiscordRpcClient;

  private readonly startedAt = Math.floor(Date.now() / 1000);

  private loginPromise: Promise<void> | null = null;

  constructor(
    client: DiscordRpcClient = new DiscordRpc.Client({ clientId: CLIENT_ID }),
  ) {
    this.client = client;
    // Discord can quit or restart while SoulFire runs. Log in again on the
    // next update instead of sending activity to a closed connection.
    this.client.on("disconnected", () => {
      this.loginPromise = null;
    });
  }

  async update(state: string, details?: string | null): Promise<void> {
    try {
      await this.ensureConnected();
      await this.client.user?.setActivity({
        state,
        details: details ?? undefined,
        startTimestamp: this.startedAt,
        largeImageKey: "logo",
        largeImageText: "SoulFire 🧙",
        buttons: [
          {
            label: "Learn more",
            url: "https://soulfiremc.com",
          },
        ],
      });
    } catch (error) {
      console.error("Failed to update Discord activity", error);
    }
  }

  private async ensureConnected(): Promise<void> {
    this.loginPromise ??= this.client.login();
    const login = this.loginPromise;
    try {
      await login;
    } catch (error) {
      // Discord may not be running yet. Try again on the next update.
      if (this.loginPromise === login) this.loginPromise = null;
      throw error;
    }
  }
}
