// @piece shutdown-deadline: Stop accepting and wait for requests within the budget
err := g.Shutdown(cfg.GracePeriodMs)
