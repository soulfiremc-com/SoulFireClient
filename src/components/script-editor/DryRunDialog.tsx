import { FlaskConical } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getNodeDefinition } from "@/components/script-editor/nodes/types";
import { Button } from "@/components/ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useScriptEditorStore } from "@/stores/script-editor-store";

/**
 * Dialog for dry-running a script from a selected trigger with mock inputs.
 * Requires the DryRunScript RPC to be available after proto regeneration.
 */
export function DryRunDialog() {
  const { t } = useTranslation("instance");
  const nodes = useScriptEditorStore((s) => s.nodes);
  const [selectedTrigger, setSelectedTrigger] = useState<string>("");
  const [mockInputs, setMockInputs] = useState<Record<string, string>>({});

  // Find all trigger nodes
  const triggerNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (!node.type) return false;
      const def = getNodeDefinition(node.type);
      return def?.isTrigger ?? false;
    });
  }, [nodes]);

  // Get output ports for the selected trigger
  const triggerOutputs = useMemo(() => {
    if (!selectedTrigger) return [];
    const node = nodes.find((n) => n.id === selectedTrigger);
    if (!node?.type) return [];
    const def = getNodeDefinition(node.type);
    if (!def) return [];
    return def.outputs.filter((p) => p.type !== "execution");
  }, [selectedTrigger, nodes]);

  const handleInputChange = useCallback((portId: string, value: string) => {
    setMockInputs((prev) => ({ ...prev, [portId]: value }));
  }, []);

  if (triggerNodes.length === 0) return null;

  return (
    <Credenza>
      <CredenzaTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            title={t("scripts.editor.dryRun.tooltip")}
          />
        }
      >
        <FlaskConical className="h-4 w-4" />
      </CredenzaTrigger>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("scripts.editor.dryRun.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("scripts.editor.dryRun.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="flex flex-col gap-4">
          <Field>
            <FieldLabel>{t("scripts.editor.dryRun.triggerNode")}</FieldLabel>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedTrigger}
              onChange={(e) => {
                setSelectedTrigger(e.target.value);
                setMockInputs({});
              }}
            >
              <option value="">
                {t("scripts.editor.dryRun.selectTrigger")}
              </option>
              {triggerNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {(node.data as { label?: string })?.label ??
                    node.type ??
                    node.id}
                </option>
              ))}
            </select>
            <FieldDescription>
              {t("scripts.editor.dryRun.triggerDescription")}
            </FieldDescription>
          </Field>

          {triggerOutputs.length > 0 && (
            <Field>
              <FieldLabel>{t("scripts.editor.dryRun.mockInputs")}</FieldLabel>
              {triggerOutputs.map((port) => (
                <Field
                  key={port.id}
                  orientation="horizontal"
                  className="items-center gap-2"
                >
                  <FieldLabel className="min-w-[100px] text-xs text-muted-foreground">
                    {port.label}
                  </FieldLabel>
                  <Input
                    placeholder={t("scripts.editor.dryRun.valuePlaceholder", {
                      type: port.type,
                    })}
                    value={mockInputs[port.id] ?? ""}
                    onChange={(e) => handleInputChange(port.id, e.target.value)}
                    className="h-8 text-sm"
                  />
                </Field>
              ))}
            </Field>
          )}

          <Button
            className="w-full"
            disabled={!selectedTrigger}
            onClick={() => {
              // Dry run will be wired up after proto regeneration
              console.log("Dry run:", selectedTrigger, mockInputs);
            }}
          >
            <FlaskConical className="h-4 w-4 mr-2" />
            {t("scripts.editor.dryRun.start")}
          </Button>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
