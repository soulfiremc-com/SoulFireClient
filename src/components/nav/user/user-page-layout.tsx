import { useSuspenseQuery } from "@tanstack/react-query";
import { CatchBoundary, useRouteContext } from "@tanstack/react-router";
import { BookOpenTextIcon } from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { CommandPaletteTrigger } from "@/components/command-palette.tsx";
import { ErrorComponent } from "@/components/error-component.tsx";
import { ExternalLink } from "@/components/external-link.tsx";
import { GlobalQueryIndicator } from "@/components/global-query-indicator.tsx";
import { LoadingComponent } from "@/components/loading-component.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

function UserCrumb() {
  const clientDataQueryOptions = useRouteContext({
    from: "/_dashboard",
    select: (context) => context.clientDataQueryOptions,
  });
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  return <>{clientInfo.username}</>;
}

function UserCrumbSkeleton() {
  return <Skeleton className="h-4 w-24" />;
}

function CrumbComponent(props: { crumb: ReactNode }) {
  return (
    <>
      <BreadcrumbItem className="hidden md:block">{props.crumb}</BreadcrumbItem>
      <BreadcrumbSeparator className="hidden md:block" />
    </>
  );
}

export default function UserPageLayout(props: {
  children: ReactNode;
  extraCrumbs?: { id: string; content: ReactNode }[];
  pageName: ReactNode;
  showUserCrumb: boolean;
  documentationLink?: string;
  loadingSkeleton?: ReactNode;
}) {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b">
        {/* The breadcrumb shrinks first, so search stays visible on narrow screens. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-4">
          <SidebarTrigger className="-ml-1" />
          {props.documentationLink && (
            <>
              <Separator
                orientation="vertical"
                className="my-auto data-[orientation=vertical]:h-4"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                nativeButton={false}
                render={<ExternalLink href={props.documentationLink} />}
              >
                <BookOpenTextIcon />
                <span className="sr-only">
                  {t("userSidebar.readDocumentation")}
                </span>
              </Button>
            </>
          )}
          <Separator
            orientation="vertical"
            className="mr-2 my-auto data-[orientation=vertical]:h-4"
          />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {props.showUserCrumb && (
                <>
                  <BreadcrumbItem className="hidden max-w-64 truncate md:block">
                    <Suspense fallback={<UserCrumbSkeleton />}>
                      <UserCrumb />
                    </Suspense>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                </>
              )}
              {(props.extraCrumbs || []).map((crumb) => (
                <CrumbComponent crumb={crumb.content} key={crumb.id} />
              ))}
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="min-w-0">
                  <span className="block truncate">{props.pageName}</span>
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex shrink-0 items-center gap-2 pr-4">
          <GlobalQueryIndicator />
          <CommandPaletteTrigger />
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1 w-full max-w-dvw">
        <div className="flex min-h-full w-full max-w-dvw flex-col p-4">
          <CatchBoundary
            getResetKey={() => "user-page-layout"}
            errorComponent={ErrorComponent}
          >
            <Suspense fallback={props.loadingSkeleton ?? <LoadingComponent />}>
              {props.children}
            </Suspense>
          </CatchBoundary>
        </div>
      </ScrollArea>
    </div>
  );
}
