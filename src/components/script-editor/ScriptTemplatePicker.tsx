import {
  HeartPulseIcon,
  type LucideIcon,
  MessageCircleReplyIcon,
  RotateCcwIcon,
  SmileIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import type {
  ScriptTemplate,
  ScriptTemplateId,
} from "@/lib/script-templates.ts";

const TEMPLATE_ICONS: Record<ScriptTemplateId, LucideIcon> = {
  "greet-on-join": SmileIcon,
  "respawn-on-death": RotateCcwIcon,
  "reply-to-chat": MessageCircleReplyIcon,
  "health-report": HeartPulseIcon,
};

/** Lists the starter graphs that this server can run. */
export function ScriptTemplatePicker(props: {
  templates: readonly ScriptTemplate[];
  disabled?: boolean;
  onPick: (template: ScriptTemplate) => void;
}) {
  const { t } = useTranslation("instance");
  return (
    <ItemGroup className="grid gap-2 sm:grid-cols-2">
      {props.templates.map((template) => {
        const Icon = TEMPLATE_ICONS[template.id];
        return (
          <div role="listitem" key={template.id}>
            <Item
              variant="outline"
              size="sm"
              className="hover:bg-muted items-start text-left"
              render={
                <button
                  type="button"
                  disabled={props.disabled}
                  onClick={() => props.onPick(template)}
                />
              }
            >
              <ItemMedia variant="icon">
                <Icon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {t(`scripts.templates.${template.id}.title`)}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {t(`scripts.templates.${template.id}.description`)}
                </ItemDescription>
              </ItemContent>
            </Item>
          </div>
        );
      })}
    </ItemGroup>
  );
}
