# @piece take-or-wait: Take a token, or wait exactly until the next one
while loop.time() < self.paused_until:
    await asyncio.sleep(self.paused_until - loop.time())
self._refill(loop.time())
if self.tokens < 1:
    await asyncio.sleep(1 / self.rate)
self.tokens -= 1
