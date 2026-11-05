# @piece import-worker-logs: Adopt the worker log group created by hand
import {
  to = aws_cloudwatch_log_group.worker
  id = "arn:aws:logs:ap-southeast-1:123456789012:log-group:/${local.name}/worker"
}
