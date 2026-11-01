import { useSelector } from "@tanstack/react-store";
import { Panel, useReactFlow } from "@xyflow/react";
import { MousePointerClickIcon, SearchIcon, ZapIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import {
  instantiateScriptTemplate,
  isTemplateSupported,
  SCRIPT_TEMPLATES,
  type ScriptTemplate,
} from "@/lib/script-templates.ts";
import { useNodeTypes } from "./NodeTypesContext";
import { ScriptTemplatePicker } from "./ScriptTemplatePicker";

const STARTER_TRIGGERS = [
  "trigger.on_join",
  "trigger.on_chat",
  "trigger.on_death",
  "trigger.on_interval",
];

/** Guides an empty canvas, then the first connection. */
export function ScriptFirstUse() {
  const { t } = useTranslation("instance");
  const editor = useScriptEditor();
  const reactFlow = useReactFlow();
  const nodes = useSelector(editor.document, (state) => state.nodes);
  const edges = useSelector(editor.document, (state) => state.edges);
  const scriptName = useSelector(editor.document, (state) => state.scriptName);
  const { definitions } = useNodeTypes();
  const templates = useMemo(() => {
    const contracts = Object.values(definitions);
    return SCRIPT_TEMPLATES.filter((template) =>
      isTemplateSupported(template, contracts),
    );
  }, [definitions]);
  const triggers = useMemo(
    () => STARTER_TRIGGERS.flatMap((type) => definitions[type] ?? []),
    [definitions],
  );
  const canvasCenter = () => {
    const screen = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    return { screen, flow: reactFlow.screenToFlowPosition(screen) };
  };

  if (nodes.length === 0) {
    const applyTemplate = (template: ScriptTemplate) => {
      editor.actions.loadScriptData({
        ...instantiateScriptTemplate(template),
        name: scriptName,
        quotas: editor.document.get().quotas,
      });
    };
    return (
      <Panel position="top-center" className="max-h-full overflow-y-auto">
        <div className="bg-card flex w-[min(42rem,calc(100vw-2rem))] flex-col gap-4 rounded-lg border p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">
              {t("scripts.firstUse.title")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("scripts.firstUse.description")}
            </p>
          </div>
          {triggers.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ZapIcon aria-hidden="true" className="size-4" />
                {t("scripts.firstUse.trigger")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {triggers.map((trigger) => (
                  <Button
                    key={trigger.type}
                    size="sm"
                    variant="outline"
                    title={trigger.description}
                    onClick={() =>
                      editor.actions.addNode(trigger.type, canvasCenter().flow)
                    }
                  >
                    {trigger.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const center = canvasCenter();
                    editor.actions.openQuickAddMenu(center.flow, center.screen);
                  }}
                >
                  <SearchIcon data-icon="inline-start" />
                  {t("scripts.firstUse.browse")}
                </Button>
              </div>
            </div>
          )}
          {templates.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {t("scripts.firstUse.template")}
              </h3>
              <ScriptTemplatePicker
                templates={templates}
                onPick={applyTemplate}
              />
            </div>
          )}
        </div>
      </Panel>
    );
  }

  if (edges.length === 0 && nodes.length <= 2) {
    return (
      <Panel position="top-center">
        <p className="bg-card text-muted-foreground flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm">
          <MousePointerClickIcon aria-hidden="true" className="size-4" />
          {t("scripts.firstUse.connectHint")}
          <Kbd>Shift</Kbd>
          <Kbd>A</Kbd>
        </p>
      </Panel>
    );
  }
  return null;
}
