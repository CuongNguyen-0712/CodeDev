# @piece env-variable: The environment name, refused unless it is a known one
variable "env" {
  type        = string
  description = "Environment name: staging or production."
  default     = "staging"
}
