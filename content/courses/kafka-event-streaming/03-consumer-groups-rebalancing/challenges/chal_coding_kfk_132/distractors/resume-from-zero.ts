// @piece resume-from-committed: Where each new partition starts reading
for (const p of partitions) {
    position.set(p, 0);
    done.set(p, 0);
}
