// @piece publish-then-mark: Publish one claimed event, then record it as sent
tx.markSent(row.id());
try {
    broker.send(TOPIC, row.aggregateId(), row.type());
} catch (BrokerException e) {
    break; // Kafka is unavailable: the rest of the batch stays unsent for the next poll
}
sent++;
