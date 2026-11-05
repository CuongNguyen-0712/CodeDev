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
  # @piece db-identity: Name and engine of the database
  identifier     = local.name
  engine         = "postgres"
  engine_version = "17"
  # @end
  # @piece db-size: Instance size, and storage that may grow by itself
  instance_class        = var.db_instance_class
  allocated_storage     = 20
  max_allocated_storage = 100
  # @end
  username                    = "rocket"
  manage_master_user_password = true
  # @piece db-protection: Refuse deletes and keep a last snapshot
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-final"
  # @end

  # @piece db-lifecycle: Never replace it; let AWS own the storage size
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [allocated_storage]
  }
  # @end
}
