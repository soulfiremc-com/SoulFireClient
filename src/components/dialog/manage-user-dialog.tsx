import { useAptabase } from "@aptabase/react";
import { createClient } from "@connectrpc/connect";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { use } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { UserRole } from "@/generated/soulfire/common_pb.ts";
import type { UserListResponse_User } from "@/generated/soulfire/user_pb.ts";
import { UserService } from "@/generated/soulfire/user_pb.ts";
import { getEnumEntries } from "@/lib/types.ts";
import { TransportContext } from "../providers/transport-context.tsx";
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

export type FormType = {
  username: string;
  email: string;
  role: UserRole;
};

export function ManageUserDialog({
  open,
  setOpen,
  ...props
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
} & ({ mode: "edit"; user: UserListResponse_User } | { mode: "add" })) {
  const usersQueryOptions = useRouteContext({
    from: "/_dashboard/user/admin/users",
    select: (context) => context.usersQueryOptions,
  });
  const queryClient = useQueryClient();
  const transport = use(TransportContext);
  const { t } = useTranslation("admin");
  const { trackEvent } = useAptabase();
  const formSchema = z.object({
    username: z
      .string()
      .min(3, t("users.baseUserDialog.form.username.min"))
      .max(32, t("users.baseUserDialog.form.username.max"))
      .regex(
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
        t("users.baseUserDialog.form.username.regex"),
      ),
    email: z.email(),
    role: z.enum(UserRole),
  });
  const submitMutation = useMutation({
    mutationKey: [
      "user",
      props.mode === "add" ? "create" : "update",
      props.mode === "edit" ? props.user.id : undefined,
    ],
    mutationFn: async (values: FormType) => {
      if (transport === null) {
        return;
      }

      void trackEvent(props.mode === "add" ? "create_user" : "update_user", {
        role: values.role,
      });

      const userService = createClient(UserService, transport);
      const promise: Promise<unknown> =
        props.mode === "add"
          ? userService.createUser({
              username: values.username,
              email: values.email,
              role: values.role,
            })
          : userService.updateUser({
              id: props.user.id,
              username: values.username,
              email: values.email,
              role: values.role,
            });
      toast.promise(promise, {
        loading:
          props.mode === "add"
            ? t("users.addToast.loading")
            : t("users.updateToast.loading"),
        success: () => {
          setOpen(false);
          return props.mode === "add"
            ? t("users.addToast.success")
            : t("users.updateToast.success");
        },
        error: (e) => {
          console.error(e);
          return props.mode === "add"
            ? t("users.addToast.error")
            : t("users.updateToast.error");
        },
      });

      return promise;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryOptions.queryKey,
      });
    },
  });
  const form = useForm({
    defaultValues: {
      username: props.mode === "edit" ? props.user.username : "",
      email: props.mode === "edit" ? props.user.email : "",
      role: props.mode === "edit" ? props.user.role : UserRole.USER,
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      submitMutation.mutate(value);
    },
  });

  return (
    <Credenza open={open} onOpenChange={setOpen}>
      <CredenzaContent className="pb-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <CredenzaHeader>
            <CredenzaTitle>
              {props.mode === "add"
                ? t("users.addUserDialog.title")
                : t("users.updateUserDialog.title")}
            </CredenzaTitle>
            <CredenzaDescription>
              {props.mode === "add"
                ? t("users.addUserDialog.description")
                : t("users.updateUserDialog.description")}
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody className="flex flex-col gap-4">
            <form.Field name="username">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      {t("users.baseUserDialog.form.username.label")}
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      autoFocus
                      placeholder={t(
                        "users.baseUserDialog.form.username.placeholder",
                      )}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                    />
                    <FieldDescription>
                      {t("users.baseUserDialog.form.username.description")}
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="email">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      {t("users.baseUserDialog.form.email.label")}
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      placeholder={t(
                        "users.baseUserDialog.form.email.placeholder",
                      )}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                    />
                    <FieldDescription>
                      {t("users.baseUserDialog.form.email.description")}
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="role">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                const roleItems = getEnumEntries(UserRole).map((role) => ({
                  label: t(
                    `users.baseUserDialog.form.role.${role.key.toLowerCase()}`,
                  ),
                  value: String(role.value),
                }));

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      {t("users.baseUserDialog.form.role.label")}
                    </FieldLabel>
                    <Select
                      name={field.name}
                      value={String(field.state.value)}
                      onValueChange={(value) =>
                        field.handleChange(Number(value))
                      }
                      items={roleItems}
                    >
                      <SelectTrigger id={field.name} aria-invalid={isInvalid}>
                        <SelectValue
                          placeholder={t(
                            "users.baseUserDialog.form.role.placeholder",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>
                            {t("users.baseUserDialog.form.role.label")}
                          </SelectLabel>
                          {roleItems.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {t("users.baseUserDialog.form.role.description")}
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>
          </CredenzaBody>
          <CredenzaFooter className="justify-between">
            <CredenzaClose asChild>
              <Button variant="outline">
                <XIcon />
                {props.mode === "add"
                  ? t("users.addUserDialog.form.cancel")
                  : t("users.updateUserDialog.form.cancel")}
              </Button>
            </CredenzaClose>
            <Button type="submit">
              {props.mode === "add" ? <PlusIcon /> : <PencilIcon />}
              {props.mode === "add"
                ? t("users.addUserDialog.form.add")
                : t("users.updateUserDialog.form.update")}
            </Button>
          </CredenzaFooter>
        </form>
      </CredenzaContent>
    </Credenza>
  );
}
