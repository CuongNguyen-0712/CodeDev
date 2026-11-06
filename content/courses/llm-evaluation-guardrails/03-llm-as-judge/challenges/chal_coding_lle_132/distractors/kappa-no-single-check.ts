// @piece kappa: Observed and chance agreement, then kappa
let diag = 0;
let pe = 0;
let used = 0;
for (let c = 0; c < k; c++) {
    diag += matrix[c][c];
    const row = matrix[c].reduce((a, b) => a + b, 0);
    const col = matrix.reduce((a, r) => a + r[c], 0);
    pe += (row / n) * (col / n);
    if (row + col > 0) used++;
}
const po = diag / n;
return { n, skipped, observed: round3(po), expected: round3(pe), kappa: round3((po - pe) / (1 - pe)), reason: null, matrix };
