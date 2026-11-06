# @piece refill: Add the tokens earned since the last look, up to capacity
self.tokens = self.tokens + (now - self.updated) * self.rate
self.updated = now
