// @piece fetch-batch: Fetch the next batch
const batch = consumer.poll(50);
for (const record of batch) consumer.commit(record.partition, record.offset + 1);
