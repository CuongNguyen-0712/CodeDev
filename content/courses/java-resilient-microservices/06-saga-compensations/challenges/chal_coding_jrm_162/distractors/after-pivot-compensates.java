// @piece after-pivot: Steps after the pivot only move forward
if (i > pivotIndex) {
    String later = svc.call(step);
    if (later.equals("ok")) {
        done.push(step);
        continue;
    }
    return compensate(done, svc);
}
