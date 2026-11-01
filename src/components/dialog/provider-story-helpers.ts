import { expect, waitFor, within } from "storybook/test";

/** Waits for the dialog entry animation before a story interacts with it. */
export async function settledDialog(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const element = await waitFor(() => {
    const current = page.getByRole("dialog");
    expect(current).toBeVisible();
    return current;
  });
  return within(element);
}
