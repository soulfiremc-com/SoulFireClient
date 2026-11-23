import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  ArrowLeftIcon,
  LoaderCircleIcon,
  MailIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  requestEmailCode,
  verifyEmailCode,
} from "@/components/launcher/email-login.ts";
import type {
  AuthFlowData,
  LoginFunction,
} from "@/components/launcher/launcher-types.ts";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  getLoginErrorMessage,
  getRejectedCodeMessage,
} from "@/lib/connection-errors.ts";

type Status = "idle" | "verifying" | "sending";
type CodeError =
  | { kind: "code"; reason: ReturnType<typeof getRejectedCodeMessage> }
  | { kind: "connection"; reason: ReturnType<typeof getLoginErrorMessage> };

export function EmailCodeMenu(props: {
  authFlowData: AuthFlowData;
  onBack: () => void;
  onCodeSent: (data: AuthFlowData) => void;
  redirectWithCredentials: LoginFunction;
}) {
  const { t } = useTranslation("login");
  const { address, email, flowToken, sentAt } = props.authFlowData;
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [codeError, setCodeError] = useState<CodeError | null>(null);
  // Going back cancels the request, so a late reply cannot sign the user in
  // or show an error on another screen.
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function run(
    nextStatus: Status,
    request: (signal: AbortSignal) => Promise<CodeError | null>,
  ) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setStatus(nextStatus);
    setCodeError(null);
    let nextError: CodeError | null;
    try {
      nextError = await request(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(error);
      nextError = {
        kind: "connection",
        reason: getLoginErrorMessage(error, "email"),
      };
    }
    if (controller.signal.aborted) return;
    pending.current = null;
    setStatus("idle");
    setCodeError(nextError);
    // Clear a rejected code, so the next six digits submit again.
    if (nextError !== null) setCode("");
  }

  const verify = (value: string) =>
    run("verifying", async (signal) => {
      const token = await verifyEmailCode(address, flowToken, value, signal);
      if (signal.aborted) return null;
      if (token !== null) {
        await props.redirectWithCredentials("dedicated", address, token);
        return null;
      }
      return {
        kind: "code",
        reason: getRejectedCodeMessage(sentAt, Date.now()),
      };
    });

  const resend = () =>
    run("sending", async (signal) => {
      const nextFlowToken = await requestEmailCode(address, email, signal);
      if (signal.aborted) return null;
      setCode("");
      props.onCodeSent({
        address,
        email,
        flowToken: nextFlowToken,
        sentAt: Date.now(),
      });
      toast.success(t("emailCode.resent", { email }));
      return null;
    });

  const busy = status !== "idle";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t("connect.dedicated.title")}
        </CardTitle>
        <CardDescription>
          <Trans
            t={t}
            i18nKey="emailCode.description"
            values={{ email }}
            components={{ bold: <strong className="font-bold" /> }}
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <InputOTP
          disabled={busy}
          autoFocus
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          value={code}
          onChange={(value) => {
            setCode(value);
            if (value.length === 6) void verify(value);
          }}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
        <div aria-live="polite" className="w-full">
          {status === "verifying" && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              {t("emailCode.checking")}
            </p>
          )}
          {codeError !== null && (
            <Alert role="alert">
              <TriangleAlertIcon />
              <AlertDescription>
                {codeError.kind === "code"
                  ? t(`emailCode.${codeError.reason}`)
                  : t(`connection.${codeError.reason}`)}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={props.onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          {t("emailCode.back")}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          aria-busy={status === "sending"}
          onClick={() => {
            void resend();
          }}
        >
          {status === "sending" ? (
            <LoaderCircleIcon
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <MailIcon data-icon="inline-start" />
          )}
          {t("emailCode.resend")}
        </Button>
      </CardFooter>
    </Card>
  );
}
