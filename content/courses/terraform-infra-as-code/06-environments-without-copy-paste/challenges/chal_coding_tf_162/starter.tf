# Rice Rocket: one root module for every environment. CI runs it with -var env=<name> and that
# environment's backend key; what differs between environments is data in this file, not a copy.
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "ap-southeast-1"
}

# [ ] The environment to plan, refused unless it is known

variable "db_password" {
  type      = string
  sensitive = true
}

# [ ] Everything that differs between environments

# [ ] The settings of the environment being planned

locals {
  name     = "rice-rocket-${var.env}"
  services = ["api", "courier-matcher", "notifications"]
  tags = {
    Project     = "rice-rocket"
    Environment = var.env
    ManagedBy   = "terraform"
  }
}

# [ ] The database, sized and protected per environment

# [ ] One log group per service, kept per environment

output "database_identifier" {
  value = aws_db_instance.main.identifier
}

output "log_groups" {
  value = { for service, group in aws_cloudwatch_log_group.service : service => group.name }
}
