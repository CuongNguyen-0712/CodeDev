// @piece union-lists: The items of both lists, each once, sorted
return [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].sort();
