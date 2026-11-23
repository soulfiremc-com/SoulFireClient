import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { HomeIcon } from "lucide-react";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  PageLayout,
  type PageLayoutProps,
} from "@/components/nav/page-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

function InstanceCrumb() {
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  return instanceInfo.friendlyName;
}

export default function InstancePageLayout(props: PageLayoutProps) {
  const { t } = useTranslation("common");

  return (
    <PageLayout
      {...props}
      documentationLabel={t("instanceSidebar.readDocumentation")}
      headerActions={
        <>
          <Separator
            orientation="vertical"
            className="my-auto data-[orientation=vertical]:h-4"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            nativeButton={false}
            render={<Link to="/user" />}
          >
            <HomeIcon />
            <span className="sr-only">
              {t("instanceSidebar.backToDashboard")}
            </span>
          </Button>
        </>
      }
      parentCrumb={
        <Suspense fallback={<Skeleton className="h-4 w-24" />}>
          <InstanceCrumb />
        </Suspense>
      }
    />
  );
}
