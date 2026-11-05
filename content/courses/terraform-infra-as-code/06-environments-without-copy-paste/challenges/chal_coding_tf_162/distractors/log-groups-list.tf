# @piece log-groups: One log group per service, kept per environment
resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/${local.name}/${each.key}"
  retention_in_days = local.current.log_retention_days
  tags              = local.tags
}
