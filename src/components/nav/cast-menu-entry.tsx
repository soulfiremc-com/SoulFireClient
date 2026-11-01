import { Link, useParams } from "@tanstack/react-router";
import { CastIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export default function CastMenuEntry() {
  const { t } = useTranslation("common");
  const params = useParams({ strict: false });
  return (
    <DropdownMenuGroup>
      <DropdownMenuItem
        render={<Link to="/cast" search={{ instance: params.instance }} />}
      >
        <CastIcon />
        <span>{t("castMenu.title")}</span>
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}
