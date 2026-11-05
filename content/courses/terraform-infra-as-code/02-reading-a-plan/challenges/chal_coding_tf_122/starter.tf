# Rice Rocket: the managed PostgreSQL of one environment. Storage autoscaling grows
# allocated_storage on its own (up to max_allocated_storage), and the instance must never be
# replaced by a plan: a replacement is a new, empty database.
variable "env" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.env)
    error_message = "env must be staging or production."
  }
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

locals {
  name = "rice-rocket-${var.env}"
}

resource "aws_db_instance" "main" {
  # [ ] Name and engine of the database
  # [ ] Instance size, and storage that may grow by itself
  username                    = "rocket"
  manage_master_user_password = true
  # [ ] Refuse deletes and keep a last snapshot

  # [ ] Never replace it; let AWS own the storage size
}
