// @piece retry-only-transient: Give up at once on errors a retry cannot fix
if (status == 400) {
    return id + " failed " + failure + " attempts=" + attempt + " elapsed=" + elapsed;
}
