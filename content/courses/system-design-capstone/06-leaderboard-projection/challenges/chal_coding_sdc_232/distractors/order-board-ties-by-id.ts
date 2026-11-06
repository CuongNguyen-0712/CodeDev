// @piece order-board: Rank a board: more points first, earlier on a tie
const rows = [...(this.boards.get(board) ?? new Map<string, Score>()).entries()];
rows.sort(([ua, a], [ub, b]) => b.points - a.points || (ua < ub ? -1 : ua > ub ? 1 : 0));
return rows.map(([userId, s], i) => ({ rank: i + 1, userId, points: s.points }));
