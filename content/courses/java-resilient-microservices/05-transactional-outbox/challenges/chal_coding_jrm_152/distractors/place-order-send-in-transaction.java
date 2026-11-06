// @piece place-order-tx: Save the order and its event as one decision
Tx tx = db.begin();
try {
    tx.insertOrder(orderId, customer);
    broker.send(TOPIC, orderId, "OrderPlaced");
    tx.commit();
} catch (DbException e) {
    tx.rollback();
    throw e;
}
