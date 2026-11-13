import { useSelector } from "@tanstack/react-store";
import { useReactFlow } from "@xyflow/react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
import { Button } from "@/components/ui/button.tsx";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
} from "@/components/ui/item.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";

/** Summarizes server validation and jumps to the node with the problem. */
export function ScriptHealthButton() {
  const { t } = useTranslation("instance");
  const editor = useScriptEditor();
  const reactFlow = useReactFlow();
  const nodes = useSelector(editor.document, (state) => state.nodes);
  const diagnostics = useSelector(
    editor.validation,
    (state) => state.validationDiagnostics,
  );
  const errors = diagnostics.filter((item) => item.severity === "error");
  const warnings = diagnostics.filter((item) => item.severity !== "error");
  const label =
    nodes.length === 0
      ? t("scripts.health.empty")
      : errors.length > 0
        ? t("scripts.health.errors", { count: errors.length })
        : warnings.length > 0
          ? t("scripts.health.warnings", { count: warnings.length })
          : t("scripts.health.ok");
  const Icon =
    nodes.length === 0
      ? CircleDashedIcon
      : errors.length > 0
        ? CircleAlertIcon
        : warnings.length > 0
          ? TriangleAlertIcon
          : CircleCheckIcon;

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <Icon
          data-icon="inline-start"
          className={
            nodes.length === 0
              ? "text-muted-foreground"
              : errors.length > 0
                ? "text-destructive"
                : warnings.length > 0
                  ? "text-warning-emphasis"
                  : "text-success-emphasis"
          }
        />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96">
        <PopoverHeader>
          <PopoverTitle>{t("scripts.health.title")}</PopoverTitle>
          <PopoverDescription>
            {t("scripts.health.description")}
          </PopoverDescription>
        </PopoverHeader>
        {diagnostics.length > 0 ? (
          <ItemGroup className="max-h-72 gap-1 overflow-y-auto">
            {diagnostics.map((item) => (
              <div role="listitem" key={`${item.nodeId}:${item.message}`}>
                <Item
                  size="xs"
                  className="hover:bg-muted text-left"
                  render={
                    <button
                      type="button"
                      onClick={() => {
                        if (!item.nodeId) return;
                        editor.actions.setSelectedNode(item.nodeId);
                        void reactFlow.fitView({
                          nodes: [{ id: item.nodeId }],
                          maxZoom: 1,
                          duration: 200,
                        });
                      }}
                    />
                  }
                >
                  <ItemMedia>
                    {item.severity === "error" ? (
                      <CircleAlertIcon className="text-destructive size-4" />
                    ) : (
                      <TriangleAlertIcon className="text-warning-emphasis size-4" />
                    )}
                  </ItemMedia>
                  <ItemContent>
                    <ItemDescription className="line-clamp-none">
                      {item.message}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            ))}
          </ItemGroup>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("scripts.health.noProblems")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
