// @piece send-push: Push "on the way" so a re-run cannot send it twice
if (event.status === "picked_up" && !seen.has(event.eventId)) {
    seen.add(event.eventId);
    push.send({ userId: event.customerId, text: `Your order ${event.orderId} is on the way` });
}
