import { BotConnectionPhase } from "@/generated/soulfire/bot_pb";

type StatusTone = "warning" | "success" | "destructive" | "muted";

export function connectionPhaseMeta(phase: BotConnectionPhase): {
  labelKey: string;
  tone: StatusTone;
  dot: string;
  showPing: boolean;
} {
  switch (phase) {
    case BotConnectionPhase.CONNECTING:
      return {
        labelKey: "bots.connectionPhase.connecting",
        tone: "warning",
        dot: "bg-warning",
        showPing: false,
      };
    case BotConnectionPhase.CONNECTED:
      return {
        labelKey: "bots.connectionPhase.connected",
        tone: "success",
        dot: "bg-success",
        showPing: true,
      };
    case BotConnectionPhase.SPAWNED:
      return {
        labelKey: "bots.connectionPhase.spawned",
        tone: "success",
        dot: "bg-success",
        showPing: true,
      };
    case BotConnectionPhase.DIED:
      return {
        labelKey: "bots.connectionPhase.died",
        tone: "destructive",
        dot: "bg-destructive",
        showPing: true,
      };
    case BotConnectionPhase.UNSPECIFIED:
    case BotConnectionPhase.DISCONNECTED:
    default:
      return {
        labelKey: "bots.connectionPhase.disconnected",
        tone: "muted",
        dot: "bg-muted-foreground/50",
        showPing: false,
      };
  }
}
