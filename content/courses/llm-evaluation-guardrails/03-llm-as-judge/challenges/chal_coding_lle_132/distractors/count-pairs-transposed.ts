// @piece count-pairs: Fill the confusion matrix, skipping unusable items
for (const it of items) {
    const h = categories.indexOf(it.human as Label);
    const j = categories.indexOf(it.judge as Label);
    if (h < 0 || j < 0) {
        skipped++;
        continue;
    }
    matrix[j][h]++;
    n++;
}
