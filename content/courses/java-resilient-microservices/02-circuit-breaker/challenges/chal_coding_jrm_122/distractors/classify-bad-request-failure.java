// @piece classify-call: Which calls are recorded, as failures or as slow
Outcome outcome = new Outcome(!result.equals("ok"), durationMs > c.slowMs());
