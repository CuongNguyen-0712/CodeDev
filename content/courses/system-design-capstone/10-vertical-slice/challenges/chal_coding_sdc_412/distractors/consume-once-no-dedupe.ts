// @piece consume-once: Add the points once per event
board.markProcessed(event.eventId);
board.incrementBy(event.userId, event.points);
