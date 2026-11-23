import { updateNumericRange, type NumericRange } from "./numeric-setting-value";

/**
 * Builds range writes when one bound changes. The other bound comes from the
 * newest write that has not failed, so a failed write is never sent again.
 */
export class NumericRangeEditor {
  #confirmed: NumericRange;
  #baseline: NumericRange;
  // Writes in the order they were sent.
  readonly #pending: NumericRange[] = [];

  constructor(value: NumericRange) {
    this.#confirmed = value;
    this.#baseline = value;
  }

  startEdit(value: NumericRange) {
    if (this.#pending.length === 0) this.#confirmed = value;
    // A refetch can still describe an earlier write while newer edits are queued.
    this.#baseline = this.#pending.at(-1) ?? value;
  }

  async save(
    bound: "min" | "max",
    value: number,
    commit: (value: NumericRange) => void | Promise<void>,
  ) {
    const next = updateNumericRange(this.#baseline, bound, value);
    this.#pending.push(next);
    let failed = false;
    try {
      await commit(next);
      this.#confirmed = next;
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      this.#pending.splice(this.#pending.indexOf(next), 1);
      if (failed && this.#baseline === next) {
        this.#baseline = this.#pending.at(-1) ?? this.#confirmed;
      }
    }
  }
}
