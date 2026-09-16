import type { CSSProperties } from "react";
import { PovFrame_CursorShape } from "@/generated/soulfire/pov_pb";

const cursors: Record<PovFrame_CursorShape, CSSProperties["cursor"]> = {
  [PovFrame_CursorShape.ARROW]: "default",
  [PovFrame_CursorShape.TEXT]: "text",
  [PovFrame_CursorShape.CROSSHAIR]: "crosshair",
  [PovFrame_CursorShape.POINTER]: "pointer",
  [PovFrame_CursorShape.RESIZE_NS]: "ns-resize",
  [PovFrame_CursorShape.RESIZE_EW]: "ew-resize",
  [PovFrame_CursorShape.RESIZE_ALL]: "move",
  [PovFrame_CursorShape.NOT_ALLOWED]: "not-allowed",
};

export function povCursor(shape: PovFrame_CursorShape): string {
  return cursors[shape] ?? "default";
}
