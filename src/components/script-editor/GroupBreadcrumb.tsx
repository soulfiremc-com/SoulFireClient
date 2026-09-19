import { useSelector } from "@tanstack/react-store";
import { ChevronRight, Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

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
      label: (node?.data?.label as string) || "Group",
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
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1 shadow-sm backdrop-blur">
      {/* Root button */}
      <button
        type="button"
        onClick={exitToRoot}
        className={cn(
          "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs",
          "hover:bg-accent text-muted-foreground hover:text-foreground",
          "transition-colors",
        )}
        title={t("scripts.editor.group.returnToRoot")}
      >
        <Home className="h-3 w-3" />
        <span>Root</span>
      </button>

      {/* Path items */}
      {pathItems.map((item, index) => (
        <div key={item.id} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <button
            type="button"
            onClick={() => navigateToDepth(index)}
            className={cn(
              "rounded px-1.5 py-0.5 text-xs transition-colors",
              index === pathItems.length - 1
                ? "bg-accent text-accent-foreground font-medium"
                : "hover:bg-accent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        </div>
      ))}

      {/* Keyboard hint */}
      <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
        Press
        <KbdGroup>
          <Kbd>Tab</Kbd>
        </KbdGroup>
        to exit
      </span>
    </div>
  );
}
