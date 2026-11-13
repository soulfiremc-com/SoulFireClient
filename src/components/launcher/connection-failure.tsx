import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getConnectionErrorKind } from "@/lib/connection-errors";

export function ConnectionFailure({ error }: { error: unknown }) {
  const { t } = useTranslation("login");
  if (!error) return null;
  return (
    <Alert role="alert">
      <TriangleAlertIcon />
      <AlertDescription>
        {t(`connection.${getConnectionErrorKind(error)}`)}
      </AlertDescription>
    </Alert>
  );
}
