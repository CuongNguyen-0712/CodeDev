// @piece model-limits: Refuse the call if any budget would be exceeded
if (this.inputTokens + this.outputTokens >= session.maxTokens) return "max_tokens";
if (this.costMicros >= session.maxCostMicros) return "max_cost";
if (this.spentToday() >= this.config.dailyCostMicrosPerUser) return "daily_cost";
if (this.elapsed() >= session.maxWallMs) return "max_wall_ms";
return null;
