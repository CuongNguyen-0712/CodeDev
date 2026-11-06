// @piece yield-turn: Give the event loop a turn between two chunks
if (start > 0) await Promise.resolve();
