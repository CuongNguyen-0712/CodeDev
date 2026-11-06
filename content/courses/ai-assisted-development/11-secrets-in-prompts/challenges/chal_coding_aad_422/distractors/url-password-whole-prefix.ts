// @piece url-password: Passwords inside connection URLs
out = out.replace(
    /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:@\/]*):[^\s@\/]+@/g,
    () => `${mark("password")}@`,
);
