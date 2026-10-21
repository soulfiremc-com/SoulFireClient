import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createContainerTextDraft,
  editContainerTextDraft,
  syncContainerTextDraft,
} from "./container-text-draft";

describe("container text drafts", () => {
  test("follows native changes until the user edits", () => {
    const initial = createContainerTextDraft("Sword");
    assert.equal(syncContainerTextDraft(initial, "Sword"), initial);
    const updated = syncContainerTextDraft(initial, "Native rename");
    assert.deepEqual(updated, createContainerTextDraft("Native rename"));

    const edited = editContainerTextDraft(updated, "Local rename", false);
    assert.deepEqual(syncContainerTextDraft(edited, "Another native rename"), {
      value: "Local rename",
      serverValue: "Another native rename",
      dirty: true,
    });
  });

  test("accepts a matching acknowledgement and resumes following native changes", () => {
    const edited = editContainerTextDraft(
      createContainerTextDraft(""),
      "Saved",
      false,
    );
    const acknowledged = syncContainerTextDraft(edited, "Saved");
    assert.deepEqual(acknowledged, createContainerTextDraft("Saved"));
    assert.deepEqual(
      syncContainerTextDraft(acknowledged, "Native edit"),
      createContainerTextDraft("Native edit"),
    );
  });

  test("preserves a newer edit while the previous save is acknowledged", () => {
    const submitted = editContainerTextDraft(
      createContainerTextDraft("Original"),
      "Saved",
      false,
    );
    const newer = editContainerTextDraft(submitted, "Next edit", true);
    const acknowledged = syncContainerTextDraft(newer, "Saved");
    assert.deepEqual(acknowledged, {
      value: "Next edit",
      serverValue: "Saved",
      dirty: true,
    });
    assert.deepEqual(
      syncContainerTextDraft(acknowledged, "Next edit"),
      createContainerTextDraft("Next edit"),
    );
  });

  test("preserves a return to the old value while saving", () => {
    const submitted = editContainerTextDraft(
      createContainerTextDraft("Original"),
      "Saved",
      false,
    );
    const reverted = editContainerTextDraft(submitted, "Original", true);
    assert.deepEqual(syncContainerTextDraft(reverted, "Saved"), {
      value: "Original",
      serverValue: "Saved",
      dirty: true,
    });
    assert.deepEqual(
      editContainerTextDraft(submitted, "Original", false),
      createContainerTextDraft("Original"),
    );
  });
});
