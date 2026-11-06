// @piece fresh-hit: Serve a fresh entry without calling the menu service
if e, ok := c.entries[key]; ok {
	c.mu.Unlock()
	return e.value, nil
}
