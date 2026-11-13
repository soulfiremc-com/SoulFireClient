import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  acknowledgeServerInputDraft,
  createServerInputDraft,
  editServerInputDraft,
  syncServerInputDraft,
} from "./server-input-draft";

describe("server input drafts", () => {
  test("accepts native normalization without replacing a newer edit", () => {
    const submitted = editServerInputDraft(
      createServerInputDraft("4"),
      "6.1",
      false,
    );
    const polled = syncServerInputDraft(submitted, "6");
    assert.deepEqual(
      acknowledgeServerInputDraft(polled, "6.1", "6"),
      createServerInputDraft("6"),
    );

    const newer = editServerInputDraft(submitted, "8", true);
    assert.deepEqual(acknowledgeServerInputDraft(newer, "6.1", "6"), {
      value: "8",
      serverValue: "6",
      dirty: true,
    });
  });

  test("follows native changes until the user edits", () => {
    const initial = createServerInputDraft("Sword");
    assert.equal(syncServerInputDraft(initial, "Sword"), initial);
    const updated = syncServerInputDraft(initial, "Native rename");
    assert.deepEqual(updated, createServerInputDraft("Native rename"));

    const edited = editServerInputDraft(updated, "Local rename", false);
    assert.deepEqual(syncServerInputDraft(edited, "Another native rename"), {
      value: "Local rename",
      serverValue: "Another native rename",
      dirty: true,
    });
  });

  test("accepts a matching acknowledgement and resumes following native changes", () => {
    const edited = editServerInputDraft(
      createServerInputDraft(""),
      "Saved",
      false,
    );
    const acknowledged = syncServerInputDraft(edited, "Saved");
    assert.deepEqual(acknowledged, createServerInputDraft("Saved"));
    assert.deepEqual(
      syncServerInputDraft(acknowledged, "Native edit"),
      createServerInputDraft("Native edit"),
    );
  });

  test("preserves a newer edit while the previous save is acknowledged", () => {
    const submitted = editServerInputDraft(
      createServerInputDraft("Original"),
      "Saved",
      false,
    );
    const newer = editServerInputDraft(submitted, "Next edit", true);
    const acknowledged = syncServerInputDraft(newer, "Saved");
    assert.deepEqual(acknowledged, {
      value: "Next edit",
      serverValue: "Saved",
      dirty: true,
    });
    assert.deepEqual(
      syncServerInputDraft(acknowledged, "Next edit"),
      createServerInputDraft("Next edit"),
    );
  });

  test("preserves a return to the old value while saving", () => {
    const submitted = editServerInputDraft(
      createServerInputDraft("Original"),
      "Saved",
      false,
    );
    const reverted = editServerInputDraft(submitted, "Original", true);
    assert.deepEqual(syncServerInputDraft(reverted, "Saved"), {
      value: "Original",
      serverValue: "Saved",
      dirty: true,
    });
    assert.deepEqual(
      editServerInputDraft(submitted, "Original", false),
      createServerInputDraft("Original"),
    );
  });
});
