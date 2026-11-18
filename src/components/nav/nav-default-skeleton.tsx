import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "../ui/sidebar";
import { generateN } from "@/lib/generate-n.ts";

export function NavDefaultSkeleton() {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {generateN(5).map((slot) => (
          <SidebarMenuItem key={slot}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
