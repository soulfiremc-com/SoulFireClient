import type { Viewport } from "@xyflow/react";

type ViewChange =
  | { type: "unchanged" }
  | { type: "fit" }
  | { type: "restore"; viewport: Viewport };

export class ScriptGroupViewports {
  private readonly views = new Map<string | null, Viewport>();
  private currentGroup: string | null | undefined;
  private settled = false;
  private canvasRevision: number | undefined;

  get initialized() {
    return this.currentGroup !== undefined;
  }

  isInitialized(canvasRevision: number) {
    return this.canvasRevision === canvasRevision && this.initialized;
  }

  enter(
    groupId: string | null,
    viewport: Viewport,
    canvasRevision: number,
  ): ViewChange {
    if (canvasRevision !== this.canvasRevision) {
      this.views.clear();
      this.currentGroup = undefined;
      this.settled = false;
      this.canvasRevision = canvasRevision;
    }
    if (groupId === this.currentGroup) return { type: "unchanged" };
    if (this.currentGroup !== undefined && this.settled)
      this.views.set(this.currentGroup, { ...viewport });

    this.currentGroup = groupId;
    const saved = this.views.get(groupId);
    this.settled = saved !== undefined;
    return saved
      ? { type: "restore", viewport: { ...saved } }
      : { type: "fit" };
  }

  completeFit(groupId: string | null, canvasRevision: number) {
    if (canvasRevision === this.canvasRevision && groupId === this.currentGroup)
      this.settled = true;
  }
}
