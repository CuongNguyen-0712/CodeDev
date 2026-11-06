// @piece server-push: Take the server's status, keep the pending changes
server[orderId] = status
pending.removeAll { it.orderId == orderId }
