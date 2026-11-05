# @piece db-lifecycle: Never replace it; let AWS own the storage size
lifecycle {
  prevent_destroy = true
  ignore_changes  = [allocated_storage, instance_class]
}
