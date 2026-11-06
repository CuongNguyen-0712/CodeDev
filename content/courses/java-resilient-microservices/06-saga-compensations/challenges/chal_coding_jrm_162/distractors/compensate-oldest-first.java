// @piece compensate-reverse: Undo what may have happened, newest first
static String compensate(Deque<String> done, Services svc) {
    Iterator<String> oldestFirst = done.descendingIterator();
    while (oldestFirst.hasNext()) {
        String step = oldestFirst.next();
        if (!retryUndo(step, svc)) return "stuck: undo " + step + " failed " + MAX_ATTEMPTS + " times";
    }
    return "compensated";
}
