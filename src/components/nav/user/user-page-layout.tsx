import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  PageLayout,
  type PageLayoutProps,
} from "@/components/nav/page-layout.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

function UserCrumb() {
  const clientDataQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.clientDataQueryOptions,
  });
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  return clientInfo.username;
}

export default function UserPageLayout({
  showUserCrumb,
  ...props
}: PageLayoutProps & { showUserCrumb: boolean }) {
  const { t } = useTranslation("common");

  return (
    <PageLayout
      {...props}
      documentationLabel={t("userSidebar.readDocumentation")}
      parentCrumb={
        showUserCrumb ? (
          <Suspense fallback={<Skeleton className="h-4 w-24" />}>
            <UserCrumb />
          </Suspense>
        ) : undefined
      }
    />
  );
}
