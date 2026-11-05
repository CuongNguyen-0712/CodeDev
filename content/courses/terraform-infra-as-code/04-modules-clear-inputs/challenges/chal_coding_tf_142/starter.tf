# modules/static-site: one static site bucket (web, admin, ...) per call.
# The caller configures the aws provider and passes env, name, options and tags.
variable "env" {
  type        = string
  description = "Environment name: staging or production."
}

# [ ] The site name, refused unless S3 can use it

# [ ] Typed options, each with a safe default

variable "tags" {
  type    = map(string)
  default = {}
}

# [ ] The site bucket, named from env and site name

# [ ] Public access blocked unless a caller opts out

# [ ] Versioning when the options ask for it

# [ ] What callers may use: the bucket name and ARN
