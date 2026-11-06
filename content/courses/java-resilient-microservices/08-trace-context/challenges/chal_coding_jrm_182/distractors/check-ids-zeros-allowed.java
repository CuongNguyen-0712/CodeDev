// @piece check-ids: trace-id and parent-id
if (!traceId.matches("[0-9a-f]{32}") || h.charAt(35) != '-') return "bad trace-id";
if (!parentId.matches("[0-9a-f]{16}") || h.charAt(52) != '-') return "bad parent-id";
