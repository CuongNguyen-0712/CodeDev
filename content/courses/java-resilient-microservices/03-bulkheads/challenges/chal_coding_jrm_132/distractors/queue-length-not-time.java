// @piece give-up-waiting: Reject calls that waited too long
while (b.waiting.size() > b.max) {
    sim.reject(b.waiting.removeLast().call(), now);
}
