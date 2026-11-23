import {
  CastDevice,
  CastSource,
  DisplaySettings,
} from "@soulfiremc/cast-protocol";
import { Schema } from "effect";

// Argument schemas for each IPC channel. The renderer is less trusted than the
// main process, so every handler decodes its arguments before it uses them.

export const NoArgs = Schema.Tuple([]);

const PovTarget = Schema.optional(Schema.Literal("pov"));

export const WindowArgs = Schema.Tuple([PovTarget]);

export const PovCaptureArgs = Schema.Tuple([Schema.Boolean, PovTarget]);

export const ThemeArgs = Schema.Tuple([
  Schema.NullOr(Schema.Literals(["dark", "light"])),
]);

export const StringArg = Schema.Tuple([Schema.String]);

export const CastConnectArgs = Schema.Tuple([
  Schema.Struct({
    device: CastDevice,
    source: CastSource,
    relaunch: Schema.optional(Schema.Boolean),
  }),
]);

export const CastSettingsArgs = Schema.Tuple([DisplaySettings]);

const FileFilter = Schema.Struct({
  name: Schema.String,
  extensions: Schema.Array(Schema.String),
});

const SaveDialogOptions = Schema.Struct({
  title: Schema.optional(Schema.String),
  filters: Schema.optional(Schema.Array(FileFilter)),
  defaultPath: Schema.optional(Schema.String),
});

export const SaveDialogArgs = Schema.Tuple([SaveDialogOptions]);

export const OpenDialogArgs = Schema.Tuple([
  Schema.Struct({
    ...SaveDialogOptions.fields,
    multiple: Schema.optional(Schema.Boolean),
    directory: Schema.optional(Schema.Boolean),
  }),
]);

export const DiscordActivityArgs = Schema.Tuple([
  Schema.String,
  Schema.optional(Schema.NullOr(Schema.String)),
]);

export const MkdirArgs = Schema.Tuple([
  Schema.String,
  Schema.optional(
    Schema.Struct({ recursive: Schema.optional(Schema.Boolean) }),
  ),
]);

export const FsWatchArgs = Schema.Tuple([
  Schema.String,
  Schema.optional(
    Schema.Struct({
      delayMs: Schema.optional(
        Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 60_000 })),
      ),
      recursive: Schema.optional(Schema.Boolean),
    }),
  ),
]);

export const FsUnwatchArgs = Schema.Tuple([Schema.Int]);

export const WriteTextFileArgs = Schema.Tuple([Schema.String, Schema.String]);

export const DiagnosticsArgs = Schema.Tuple([Schema.optional(Schema.Int)]);

export const RunIntegratedServerArgs = Schema.Tuple([
  Schema.Struct({
    forceSoftwareRendering: Schema.optional(Schema.Boolean),
    jarSource: Schema.optional(
      Schema.Union([
        Schema.Struct({ type: Schema.Literal("official") }),
        Schema.Struct({
          type: Schema.Literal("custom"),
          jarId: Schema.NonEmptyString,
        }),
      ]),
    ),
    jvmArgs: Schema.Array(Schema.String),
  }),
]);

export const PathResolveArgs = Schema.Array(Schema.String);
