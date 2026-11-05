# @piece db-lifecycle: Never replace it; let AWS own the storage size
lifecycle {
  ignore_changes = [allocated_storage]
}
