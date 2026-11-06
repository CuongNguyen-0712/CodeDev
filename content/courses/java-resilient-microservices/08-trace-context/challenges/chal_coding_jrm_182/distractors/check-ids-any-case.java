// @piece check-ids: trace-id and parent-id
if (!traceId.matches("[0-9a-fA-F]{32}") || h.charAt(35) != '-') return "bad trace-id";
if (traceId.equals(ZERO_TRACE)) return "zero trace-id";
if (!parentId.matches("[0-9a-fA-F]{16}") || h.charAt(52) != '-') return "bad parent-id";
if (parentId.equals(ZERO_SPAN)) return "zero parent-id";
