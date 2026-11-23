import { CatchBoundary, useRouterState } from "@tanstack/react-router";
import { BookOpenTextIcon } from "lucide-react";
import { type ReactNode, Suspense } from "react";
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

export interface PageLayoutProps {
  children: ReactNode;
  extraCrumbs?: { id: string; content: ReactNode }[];
  pageName: ReactNode;
  documentationLink?: string;
  loadingSkeleton?: ReactNode;
}

/**
 * The header, breadcrumb, and error and loading boundaries shared by the user
 * and project pages.
 */
export function PageLayout(
  props: PageLayoutProps & {
    /** Buttons after the sidebar trigger. */
    headerActions?: ReactNode;
    /** The first crumb, hidden on narrow screens. */
    parentCrumb?: ReactNode;
    documentationLabel: string;
  },
) {
  // A page error clears when the user opens another page, such as another bot.
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b">
        {/* The breadcrumb shrinks first, so search stays visible on narrow screens. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-4">
          <SidebarTrigger className="-ml-1" />
          {props.headerActions}
          {props.documentationLink && (
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
                render={<ExternalLink href={props.documentationLink} />}
              >
                <BookOpenTextIcon />
                <span className="sr-only">{props.documentationLabel}</span>
              </Button>
            </>
          )}
          <Separator
            orientation="vertical"
            className="my-auto mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {props.parentCrumb !== undefined && (
                <>
                  <BreadcrumbItem className="hidden max-w-64 truncate md:block">
                    {props.parentCrumb}
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                </>
              )}
              {(props.extraCrumbs ?? []).map((crumb) => (
                <BreadcrumbCrumb key={crumb.id} crumb={crumb.content} />
              ))}
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="min-w-0">
                  <h1
                    className="block truncate"
                    title={
                      typeof props.pageName === "string"
                        ? props.pageName
                        : undefined
                    }
                  >
                    {props.pageName}
                  </h1>
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
      <ScrollArea className="min-h-0 w-full max-w-dvw flex-1">
        <div className="flex min-h-full w-full max-w-dvw flex-col p-4">
          <CatchBoundary
            getResetKey={() => pathname}
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

function BreadcrumbCrumb(props: { crumb: ReactNode }) {
  return (
    <>
      <BreadcrumbItem className="hidden md:block">{props.crumb}</BreadcrumbItem>
      <BreadcrumbSeparator className="hidden md:block" />
    </>
  );
}
