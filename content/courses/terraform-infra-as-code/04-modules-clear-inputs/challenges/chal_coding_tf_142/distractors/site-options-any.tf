# @piece site-options: Typed options, each with a safe default
variable "options" {
  description = "Site options."
  type        = any
  default     = {}
}
