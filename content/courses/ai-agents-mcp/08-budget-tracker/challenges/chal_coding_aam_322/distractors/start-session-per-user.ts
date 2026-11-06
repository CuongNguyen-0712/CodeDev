// @piece start-session: Reset the session; daily spend is per user and day
this.dayKey = userId;
this.startedAt = this.clock.now();
this.modelCalls = 0;
this.inputTokens = 0;
this.outputTokens = 0;
this.costMicros = 0;
this.toolCalls = {};
