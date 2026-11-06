// @piece coalesce: Join a load of this menu that is already running
if (cache.loading(key)) {
    db.startLoad(cache, key, now); // the earlier load may be slow: read it again
    return "load";
}
