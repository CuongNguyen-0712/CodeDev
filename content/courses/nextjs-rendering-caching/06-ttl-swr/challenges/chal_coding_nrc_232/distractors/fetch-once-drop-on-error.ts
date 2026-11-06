// @piece fetch-once: Start the fetch and store its result
const fetching = this.origin.fetch(key).then(
    (value) => {
        this.inFlight.delete(key);
        this.entries.set(key, { value, fetchedAt: this.clock.now() });
        return value;
    },
    (error: unknown) => {
        this.inFlight.delete(key);
        this.entries.delete(key);
        throw error;
    },
);
this.inFlight.set(key, fetching);
return fetching;
