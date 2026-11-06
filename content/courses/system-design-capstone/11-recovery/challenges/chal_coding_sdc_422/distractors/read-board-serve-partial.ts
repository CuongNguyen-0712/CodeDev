// @piece read-board: Validate, then read the live board or the snapshot
if (typeof board !== "string" || !BOARD_NAME.test(board)) return { status: "error", error: "unknown_board" };
if (!Number.isInteger(n) || n < 1 || n > 100) return { status: "error", error: "invalid_limit" };
if (this.status === "ready" || this.cursor > 0) return { status: "ready", top: this.cache.ztop(this.key(this.building, board), n) };
return { status: "rebuilding", asOfSeq: this.snapshot.asOfSeq, top: (this.snapshot.boards[board] ?? []).slice(0, n) };
