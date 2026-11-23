import { type BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import { Schema } from "effect";

/** Registers an invoke handler whose arguments are decoded with `args`. */
export type HandleIpc = <
  S extends Schema.ConstraintDecoder<readonly unknown[]>,
>(
  channel: string,
  args: S,
  handler: (sender: BrowserWindow, ...args: S["Type"]) => unknown,
) => void;

export function createIpcRegistrar(
  validateSender: (event: IpcMainInvokeEvent) => BrowserWindow,
): HandleIpc {
  return (channel, args, handler) => {
    const decode = Schema.decodeUnknownSync(args);
    ipcMain.handle(channel, (event, ...rawArgs: unknown[]) => {
      const sender = validateSender(event);
      let decoded;
      try {
        decoded = decode(rawArgs);
      } catch (error) {
        throw new Error(`Invalid arguments for ${channel}`, { cause: error });
      }
      return handler(sender, ...decoded);
    });
  };
}
