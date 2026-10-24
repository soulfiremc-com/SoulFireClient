import type { Edge, Node } from "@xyflow/react";
import { z } from "zod";
import { desktop, isDesktopApp } from "@/lib/desktop";
import { scriptGraphSchema } from "@/lib/script-graph";

const CLIPBOARD_PREFIX = "SOULFIRE_SCRIPT_CLIPBOARD:";
const LOCAL_STORAGE_KEY = "script-editor-clipboard";
const clipboardSchema = scriptGraphSchema.extend({
  sourceScriptId: z.string().nullable().optional().default(null),
});

export interface ScriptClipboardData {
  nodes: Node[];
  edges: Edge[];
  sourceScriptId: string | null;
}

/**
 * Serialize clipboard data for storage/transfer.
 */
function serializeClipboardData(data: ScriptClipboardData): string {
  return CLIPBOARD_PREFIX + JSON.stringify(data);
}

/**
 * Parse clipboard text into ScriptClipboardData if valid.
 */
function parseClipboardJson(text: string): ScriptClipboardData | null {
  try {
    return clipboardSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

function parseClipboardText(text: string): ScriptClipboardData | null {
  return text.startsWith(CLIPBOARD_PREFIX)
    ? parseClipboardJson(text.slice(CLIPBOARD_PREFIX.length))
    : null;
}

function readStoredClipboard(): ScriptClipboardData | null {
  try {
    return parseClipboardJson(localStorage.getItem(LOCAL_STORAGE_KEY) ?? "");
  } catch {
    return null;
  }
}

/**
 * Handle native copy event - write to clipboard without permission prompt.
 * Call this from a 'copy' event handler.
 */
export function handleNativeCopy(
  event: ClipboardEvent,
  data: ScriptClipboardData,
): void {
  const serialized = serializeClipboardData(data);

  // Write to native clipboard via the event (no permission needed)
  event.clipboardData?.setData("text/plain", serialized);
  event.preventDefault();

  // Also save to localStorage as fallback
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
}

/**
 * Handle native paste event - read from clipboard without permission prompt.
 * Call this from a 'paste' event handler.
 */
export function handleNativePaste(
  event: ClipboardEvent,
): ScriptClipboardData | null {
  const text = event.clipboardData?.getData("text/plain") ?? "";

  // Supplied text takes precedence, even when invalid or unrelated to a script.
  // Only fall back when the browser cannot provide clipboard text.
  const data = text ? parseClipboardText(text) : readStoredClipboard();
  if (data) event.preventDefault();
  return data;
}

/**
 * Copy to the desktop clipboard for non-event contexts.
 * In the browser we fall back to localStorage unless there is a user gesture.
 */
export async function copyToDesktopClipboard(
  data: ScriptClipboardData,
): Promise<void> {
  if (!isDesktopApp()) {
    // For browser, just save to localStorage - actual clipboard write
    // should happen via handleNativeCopy in a copy event
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    return;
  }

  const serialized = serializeClipboardData(data);
  await desktop.clipboard.writeText(serialized);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
}

/**
 * Read from the desktop clipboard for non-event contexts.
 * In the browser we fall back to localStorage unless there is a user gesture.
 */
export async function readFromDesktopClipboard(): Promise<ScriptClipboardData | null> {
  if (!isDesktopApp()) {
    // For browser, read from localStorage - actual clipboard read
    // should happen via handleNativePaste in a paste event
    return readStoredClipboard();
  }

  try {
    const text = await desktop.clipboard.readText();
    if (text) return parseClipboardText(text);
  } catch {
    // Clipboard read failed
  }

  // Fallback to localStorage
  return readStoredClipboard();
}

/**
 * Check if there's valid script data available (localStorage check only).
 */
export function hasScriptClipboardData(): boolean {
  return (readStoredClipboard()?.nodes.length ?? 0) > 0;
}
