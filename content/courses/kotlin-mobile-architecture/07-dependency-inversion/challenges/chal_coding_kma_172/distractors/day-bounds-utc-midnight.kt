// @piece day-bounds: Where today starts and tomorrow starts
val start = day.atStartOfDay(ZoneOffset.UTC).toInstant()
val end = day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant()
