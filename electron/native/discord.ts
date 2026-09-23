import { createRequire } from "node:module";

const require = createRequire(__filename);
const DiscordRpc = require("@xhayper/discord-rpc") as {
  Client: new (options: { transport: "ipc" }) => {
    login: (options: { clientId: string }) => Promise<void>;
    on: (event: string, handler: () => void) => void;
    setActivity: (activity: Record<string, unknown>) => Promise<void>;
  };
};

const CLIENT_ID = "1248603974475583608";

export class DiscordPresenceManager {
  private readonly client = new DiscordRpc.Client({
    transport: "ipc",
  });

  private readonly startedAt = Math.floor(Date.now() / 1000);

  private ready = false;

  private loginPromise: Promise<void> | null = null;

  async update(state: string, details?: string | null): Promise<void> {
    try {
      await this.ensureConnected();
      if (!this.ready) {
        return;
      }

      await this.client.setActivity({
        state,
        details: details ?? undefined,
        startTimestamp: this.startedAt,
        largeImageKey: "logo",
        largeImageText: "SoulFire \uD83E\uDDD9",
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
    if (this.ready) {
      return;
    }

    if (this.loginPromise !== null) {
      await this.loginPromise;
      return;
    }

    this.loginPromise = (async () => {
      this.client.on("ready", () => {
        this.ready = true;
      });

      await this.client.login({
        clientId: CLIENT_ID,
      });
      this.ready = true;
    })();

    try {
      await this.loginPromise;
    } catch (error) {
      this.loginPromise = null;
      throw error;
    }
  }
}
