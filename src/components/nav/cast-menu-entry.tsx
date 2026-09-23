import { CastIcon, SearchXIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { desktop } from "@/lib/desktop.ts";
import { cancellablePromiseDefault, cn } from "@/lib/utils.tsx";

type MediaDeviceInfo = {
  id: string;
  full_name: string;
  name: string;
  address: string;
  port: number;
};

type MediaDeviceDisconnected = {
  transport_id: string;
};

type MediaDeviceState = {
  info: MediaDeviceInfo;
  transport_id: string | null;
};

export default function CastMenuEntry() {
  const { t } = useTranslation("common");
  const [devices, setDevices] = useState<MediaDeviceState[]>([]);

  useEffect(() => {
    void desktop.cast.getDevices().then((currentDevices) => {
      setDevices(
        currentDevices.map((device) => ({
          info: device,
          transport_id: null,
        })),
      );
    });

    const cancelDisconnected = cancellablePromiseDefault(
      desktop.cast.onDisconnected((payload) => {
        const disconnected = payload as MediaDeviceDisconnected;
        setDevices((devices) =>
          devices.map((device) => {
            if (device.transport_id === disconnected.transport_id) {
              toast.info(
                t("castMenu.disconnected", {
                  device: device.info.name,
                }),
              );
              return {
                ...device,
                transport_id: null,
              };
            }

            return device;
          }),
        );
      }),
    );
    const cancelDiscovered = cancellablePromiseDefault(
      desktop.cast.onDiscovered((device) => {
        setDevices((devices) => {
          if (devices.some((current) => current.info.id === device.id)) {
            return devices;
          }

          return [
            ...devices,
            {
              info: device,
              transport_id: null,
            },
          ];
        });
      }),
    );
    const cancelRemoved = cancellablePromiseDefault(
      desktop.cast.onRemoved((payload) => {
        setDevices((devices) =>
          devices.filter(
            (device) => device.info.full_name !== payload.full_name,
          ),
        );
      }),
    );

    return () => {
      cancelDisconnected();
      cancelDiscovered();
      cancelRemoved();
    };
  }, [t]);

  useEffect(() => {
    void desktop.cast.discover();
  }, []);

  return (
    <DropdownMenuGroup>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <CastIcon />
          <span>{t("castMenu.title")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {devices.length > 0 ? (
              devices.map((currentDevice) => (
                <DropdownMenuItem
                  key={currentDevice.info.id}
                  onClick={() => {
                    if (currentDevice.transport_id !== null) {
                      toast.warning(
                        t("castMenu.alreadyConnected", {
                          device: currentDevice.info.name,
                        }),
                      );
                      return;
                    }

                    toast.promise(
                      desktop.cast.connect(
                        currentDevice.info.address,
                        currentDevice.info.port,
                      ),
                      {
                        loading: t("castMenu.connectToast.loading", {
                          device: currentDevice.info.name,
                        }),
                        success: (transportId) => {
                          setDevices((devices) =>
                            devices.map((device) => {
                              if (
                                device.info.full_name ===
                                currentDevice.info.full_name
                              ) {
                                return {
                                  ...device,
                                  transport_id: transportId as string,
                                };
                              }

                              return device;
                            }),
                          );

                          return t("castMenu.connectToast.success", {
                            device: currentDevice.info.name,
                          });
                        },
                        error: (e) => {
                          console.error(e);
                          return t("castMenu.connectToast.error", {
                            device: currentDevice.info.name,
                          });
                        },
                      },
                    );
                  }}
                >
                  <CastIcon
                    className={cn({
                      "text-success": currentDevice.transport_id !== null,
                      "text-destructive": currentDevice.transport_id === null,
                    })}
                  />
                  <span>{currentDevice.info.name}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem
                disabled
                onClick={() => {
                  toast.warning(t("castMenu.noDevices"));
                }}
              >
                <SearchXIcon />
                <span>{t("castMenu.noDevices")}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  );
}
