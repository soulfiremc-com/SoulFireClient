import { createSupportReminder } from "@/lib/support-reminder";

let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {
  // Restricted storage must not prevent using the app.
}

export const supportReminder = createSupportReminder({ storage });
