"use client";

import { useRender } from "@base-ui/react/use-render";
import { mergeProps } from "@base-ui/react/merge-props";

import * as React from "react";
import { useLazyRef } from "@/hooks/use-lazy-ref";

import { cn } from "@/lib/utils";

const ROOT_NAME = "QRCode";

const SVG_NAME = "QRCodeSvg";
const IMAGE_NAME = "QRCodeImage";

type QRCodeLevel = "L" | "M" | "Q" | "H";

interface QRCodeCanvasOpts {
  errorCorrectionLevel: QRCodeLevel;
  type?: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
  margin?: number;
  color?: {
    dark: string;
    light: string;
  };
  width?: number;
  rendererOpts?: {
    quality?: number;
  };
}

interface StoreState {
  dataUrl: string | null;
  svgString: string | null;
  isGenerating: boolean;
  error: Error | null;
  generationKey: string;
}

interface Store {
  subscribe: (callback: () => void) => () => void;
  getState: () => StoreState;
  setState: <K extends keyof StoreState>(key: K, value: StoreState[K]) => void;
  setStates: (updates: Partial<StoreState>) => void;
  notify: () => void;
}

interface QRCodeContextValue {
  value: string;
  size: number;
  margin: number;
  level: QRCodeLevel;
  backgroundColor: string;
  foregroundColor: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const StoreContext = React.createContext<Store | null>(null);

function useStore<T>(selector: (state: StoreState) => T): T {
  const store = React.useContext(StoreContext);
  if (!store) {
    throw new Error(`\`useQRCode\` must be used within \`${ROOT_NAME}\``);
  }

  const getSnapshot = React.useCallback(
    () => selector(store.getState()),
    [store, selector],
  );

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

const QRCodeContext = React.createContext<QRCodeContextValue | null>(null);

function useQRCodeContext(consumerName: string) {
  const context = React.useContext(QRCodeContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

interface QRCodeProps extends Omit<useRender.ComponentProps<"div">, "onError"> {
  value: string;
  size?: number;
  level?: QRCodeLevel;
  margin?: number;
  quality?: number;
  backgroundColor?: string;
  foregroundColor?: string;
  onError?: (error: Error) => void;
  onGenerated?: () => void;
}

function QRCode(props: QRCodeProps) {
  const {
    value,
    size = 200,
    level = "M",
    margin = 1,
    quality = 0.92,
    backgroundColor = "#ffffff",
    foregroundColor = "#000000",
    onError,
    onGenerated,
    className,
    style,
    render,
    ...rootProps
  } = props;

  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const listenersRef = useLazyRef(() => new Set<() => void>());
  const stateRef = useLazyRef<StoreState>(() => ({
    dataUrl: null,
    svgString: null,
    isGenerating: false,
    error: null,
    generationKey: "",
  }));

  const store = React.useMemo<Store>(() => ({
      subscribe: (cb) => {
        listenersRef.current.add(cb);
        return () => {
          listenersRef.current.delete(cb);
        };
      },
      getState: () => stateRef.current,
      setState: (key, value) => {
        if (Object.is(stateRef.current[key], value)) return;
        stateRef.current[key] = value;
        store.notify();
      },
      setStates: (updates) => {
        let hasChanged = false;

        for (const key of Object.keys(updates) as (keyof StoreState)[]) {
          const value = updates[key];
          if (value !== undefined && !Object.is(stateRef.current[key], value)) {
            Object.assign(stateRef.current, { [key]: value });
            hasChanged = true;
          }
        }

        if (hasChanged) {
          store.notify();
        }
      },
      notify: () => {
        for (const cb of listenersRef.current) {
          cb();
        }
      },
    }), [listenersRef, stateRef]);

  const canvasOpts = React.useMemo<QRCodeCanvasOpts>(
    () => ({
      errorCorrectionLevel: level,
      type: "image/png",
      quality,
      margin,
      color: {
        dark: foregroundColor,
        light: backgroundColor,
      },
      width: size,
    }),
    [level, margin, foregroundColor, backgroundColor, size, quality],
  );

  const generationKey = React.useMemo(() => {
    if (!value) return "";

    return JSON.stringify({
      value,
      size,
      level,
      margin,
      quality,
      foregroundColor,
      backgroundColor,
    });
  }, [value, level, margin, foregroundColor, backgroundColor, size, quality]);

  const onQRCodeGenerate = React.useCallback(
    async (targetGenerationKey: string) => {
      if (!value || !targetGenerationKey) return;

      const currentState = store.getState();
      if (
        currentState.isGenerating ||
        currentState.generationKey === targetGenerationKey
      )
        return;

      store.setStates({
        isGenerating: true,
        error: null,
      });

      try {
        const QRCode = (await import("qrcode")).default;

        let dataUrl: string | null = null;

        try {
          dataUrl = await QRCode.toDataURL(value, canvasOpts);
        } catch {
          dataUrl = null;
        }

        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, value, canvasOpts);
        }

        const svgString = await QRCode.toString(value, {
          errorCorrectionLevel: canvasOpts.errorCorrectionLevel,
          margin: canvasOpts.margin,
          color: canvasOpts.color,
          width: canvasOpts.width,
          type: "svg",
        });

        store.setStates({
          dataUrl,
          svgString,
          isGenerating: false,
          generationKey: targetGenerationKey,
        });

        onGenerated?.();
      } catch (error) {
        const parsedError =
          error instanceof Error
            ? error
            : new Error("Failed to generate QR code");
        store.setStates({
          error: parsedError,
          isGenerating: false,
        });
        onError?.(parsedError);
      }
    },
    [value, canvasOpts, store, onError, onGenerated],
  );

  const contextValue = React.useMemo<QRCodeContextValue>(
    () => ({
      value,
      size,
      level,
      margin,
      backgroundColor,
      foregroundColor,
      canvasRef,
    }),
    [value, size, backgroundColor, foregroundColor, level, margin],
  );

  React.useLayoutEffect(() => {
    if (generationKey) {
      const rafId = requestAnimationFrame(() => {
        void onQRCodeGenerate(generationKey);
      });

      return () => {
        cancelAnimationFrame(rafId);
      };
    }
    return undefined;
  }, [generationKey, onQRCodeGenerate]);

  const element = useRender({
    defaultTagName: "div",
    render,
    props: mergeProps({ "data-slot": "qr-code" }, rootProps, {
      className: cn(className, "relative flex flex-col items-center gap-2"),
      style: {
        "--qr-code-size": `${size}px`,
        ...style,
      } as React.CSSProperties,
    }),
  });

  return (
    <StoreContext.Provider value={store}>
      <QRCodeContext.Provider value={contextValue}>
        {element}
      </QRCodeContext.Provider>
    </StoreContext.Provider>
  );
}

type QRCodeSvgProps = useRender.ComponentProps<"div">;

function QRCodeSvg(props: QRCodeSvgProps) {
  const { render, className, style, ...svgProps } = props;

  const context = useQRCodeContext(SVG_NAME);
  const svgString = useStore((state) => state.svgString);

  const element = useRender({
    defaultTagName: "div",
    render,
    props: mergeProps({ "data-slot": "qr-code-svg" }, svgProps, {
      className: cn(
        "relative max-h-(--qr-code-size) max-w-(--qr-code-size)",
        className,
      ),
      style: { width: context.size, height: context.size, ...style },
      dangerouslySetInnerHTML: { __html: svgString },
    }),
  });
  if (!svgString) return null;
  return element;
}

type QRCodeImageProps = useRender.ComponentProps<"img">;

function QRCodeImage(props: QRCodeImageProps) {
  const { alt = "QR Code", render, className, ...imageProps } = props;

  const context = useQRCodeContext(IMAGE_NAME);
  const dataUrl = useStore((state) => state.dataUrl);

  const element = useRender({
    defaultTagName: "img",
    render,
    props: mergeProps({ "data-slot": "qr-code-image" }, imageProps, {
      src: dataUrl,
      alt,
      width: context.size,
      height: context.size,
      className: cn(
        "relative max-h-(--qr-code-size) max-w-(--qr-code-size)",
        className,
      ),
    }),
  });
  if (!dataUrl) return null;
  return element;
}

export {
  QRCode,

  QRCodeImage,

  //
  type QRCodeProps,

  QRCodeSvg,
  //
};
