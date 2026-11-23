import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getLoginErrorMessage } from "@/lib/connection-errors";

export function ConnectionFailure({
  error,
  method,
}: {
  error: unknown;
  method: "email" | "token";
}) {
  const { t } = useTranslation("login");
  if (!error) return null;
  return (
    <Alert role="alert">
      <TriangleAlertIcon />
      <AlertDescription>
        {t(`connection.${getLoginErrorMessage(error, method)}`)}
      </AlertDescription>
    </Alert>
  );
}
