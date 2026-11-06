// @piece ack: Delete the message for a current handle
const m = this.messages.get(receiptHandle.slice(0, receiptHandle.lastIndexOf("#")));
if (!m) return false;
this.messages.delete(m.id);
return true;
