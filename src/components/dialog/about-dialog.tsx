import type { ClientDataResponse } from "@soulfiremc/sdk/generated/soulfire/client_pb";
import { useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { createContext, type ReactNode, use, useState } from "react";
import { useTranslation } from "react-i18next";
import { SystemInfoContext } from "@/components/providers/system-info-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "../ui/credenza.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table.tsx";

export const AboutContext = createContext<{
  openAbout: () => void;
}>(null as never);

export function AboutProvider(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AboutContext
        value={{
          openAbout: () => {
            setOpen(true);
          },
        }}
      >
        {props.children}
      </AboutContext>
      <AboutDialog open={open} setOpen={setOpen} />
    </>
  );
}

function AboutDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const systemInfo = use(SystemInfoContext);
  const queryClient = useQueryClient();
  const clientData = queryClient.getQueryData<ClientDataResponse>([
    "client-data",
  ]);

  return (
    <Credenza open={open} onOpenChange={setOpen}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("dialog.about.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("dialog.about.description", {
              version: APP_VERSION,
            })}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("dialog.about.type")}</TableHead>
                <TableHead>{t("dialog.about.value")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientData?.serverInfo && (
                <>
                  <TableRow>
                    <TableCell>
                      {t("dialog.about.fields.serverVersion")}
                    </TableCell>
                    <TableCell className="select-text">
                      {clientData.serverInfo.version}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      {t("dialog.about.fields.serverCommit")}
                    </TableCell>
                    <TableCell className="select-text">
                      {clientData.serverInfo.commitHash.substring(0, 7)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      {t("dialog.about.fields.serverBranch")}
                    </TableCell>
                    <TableCell className="select-text">
                      {clientData.serverInfo.branchName}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      {t("dialog.about.fields.minecraftVersion")}
                    </TableCell>
                    <TableCell className="select-text">
                      {clientData.serverInfo.minecraftVersion}
                    </TableCell>
                  </TableRow>
                </>
              )}
              {systemInfo !== null ? (
                <>
                  <TableRow>
                    <TableCell>
                      {t("dialog.about.fields.operatingSystem")}
                    </TableCell>
                    <TableCell className="select-text">
                      {systemInfo.osType} {systemInfo.osVersion}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell>{t("dialog.about.fields.platform")}</TableCell>
                    <TableCell className="select-text">
                      {systemInfo.platformName}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell>{t("dialog.about.fields.locale")}</TableCell>
                    <TableCell className="select-text">
                      {systemInfo.osLocale ?? "Unknown"}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell>
                      {t("dialog.about.fields.architecture")}
                    </TableCell>
                    <TableCell className="select-text">
                      {systemInfo.archName}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell>
                      {t("dialog.about.fields.environment")}
                    </TableCell>
                    <TableCell className="select-text">
                      {APP_ENVIRONMENT}
                    </TableCell>
                  </TableRow>
                </>
              ) : (
                <>
                  <TableRow>
                    <TableCell>{t("dialog.about.fields.browser")}</TableCell>
                    <TableCell className="select-text">
                      {navigator.userAgent}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell>{t("dialog.about.fields.locale")}</TableCell>
                    <TableCell className="select-text">
                      {navigator.language}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell>
                      {t("dialog.about.fields.environment")}
                    </TableCell>
                    <TableCell className="select-text">
                      {APP_ENVIRONMENT}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button>
              <XIcon />
              {t("dialog.about.close")}
            </Button>
          </CredenzaClose>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
