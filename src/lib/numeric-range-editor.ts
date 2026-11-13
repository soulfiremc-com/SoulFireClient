import { updateNumericRange, type NumericRange } from "./numeric-setting-value";

export class NumericRangeEditor {
  #baseline: NumericRange;
  #latest: NumericRange;
  #pendingWrites = 0;

  constructor(value: NumericRange) {
    this.#baseline = value;
    this.#latest = value;
  }

  startEdit(value: NumericRange) {
    // A refetch can still describe an earlier write while newer edits are queued.
    this.#baseline = this.#pendingWrites > 0 ? this.#latest : value;
  }

  async save(
    bound: "min" | "max",
    value: number,
    commit: (value: NumericRange) => void | Promise<void>,
  ) {
    const next = updateNumericRange(this.#baseline, bound, value);
    this.#latest = next;
    this.#pendingWrites++;
    try {
      await commit(next);
    } finally {
      this.#pendingWrites--;
    }
  }
}
