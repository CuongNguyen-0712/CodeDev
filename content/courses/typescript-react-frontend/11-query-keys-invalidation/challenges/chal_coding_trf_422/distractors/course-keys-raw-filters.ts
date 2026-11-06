// @piece course-keys: The course query keys
lists: () => [...courseKeys.all, "list"] as const,
list: (filters: Filters) => [...courseKeys.lists(), filters] as const,
details: () => [...courseKeys.all, "detail"] as const,
detail: (id: string) => [...courseKeys.details(), id] as const,
