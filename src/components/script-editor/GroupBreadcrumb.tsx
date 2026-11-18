import { useSelector } from "@tanstack/react-store";
import { ChevronRight, Home } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/script-editor-context";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { nodeDataString } from "@/lib/script-node-data";

/**
 * GroupBreadcrumb - Blender-style breadcrumb navigation for group editing
 * Shows the path of nested groups when editing inside a group node.
 */
export function GroupBreadcrumb() {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const nodes = useSelector(editor.document, (s) => s.nodes);
  const groupEditStack = useSelector(editor.ui, (s) => s.groupEditStack);
  const exitToRoot = editor.actions.exitToRoot;
  const exitGroup = editor.actions.exitGroup;

  // Don't show if we're at the root level
  if (groupEditStack.length === 0) return null;

  // Build the breadcrumb path
  const pathItems = groupEditStack.map((groupId) => {
    const node = nodes.find((n) => n.id === groupId);
    return {
      id: groupId,
      label:
        nodeDataString(node?.data, "label") ||
        t("scripts.editor.group.defaultLabel"),
    };
  });

  // Navigate to a specific depth in the stack
  const navigateToDepth = (depth: number) => {
    const currentDepth = groupEditStack.length;
    // Pop groups until we reach the target depth
    const popsNeeded = currentDepth - depth - 1;
    for (let i = 0; i < popsNeeded; i++) {
      exitGroup();
    }
  };

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1 shadow-sm backdrop-blur-sm">
      {/* Root button */}
      <button
        type="button"
        onClick={exitToRoot}
        className={cn(
          "flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs",
          "text-muted-foreground hover:bg-accent hover:text-foreground",
          "transition-colors",
        )}
        title={t("scripts.editor.group.returnToRoot")}
      >
        <Home className="size-3" />
        <span>{t("scripts.editor.group.root")}</span>
      </button>

      {/* Path items */}
      {pathItems.map((item, index) => (
        <div key={item.id} className="flex items-center gap-1">
          <ChevronRight className="size-3 text-muted-foreground" />
          <button
            type="button"
            onClick={() => navigateToDepth(index)}
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-xs transition-colors",
              index === pathItems.length - 1
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        </div>
      ))}

      {/* Keyboard hint */}
      <span className="ml-2 hidden items-center gap-1 text-xs text-muted-foreground pointer-fine:inline-flex">
        <Trans
          t={t}
          i18nKey="scripts.editor.group.exitHint"
          components={{
            key: (
              <KbdGroup>
                <Kbd />
              </KbdGroup>
            ),
          }}
        />
      </span>
    </div>
  );
}
