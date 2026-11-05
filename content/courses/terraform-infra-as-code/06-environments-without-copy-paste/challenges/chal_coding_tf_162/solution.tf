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

# @piece env-variable: The environment to plan, refused unless it is known
variable "env" {
  type        = string
  description = "Environment name: staging or production."
  validation {
    condition     = contains(["staging", "production"], var.env)
    error_message = "env must be staging or production."
  }
}
# @end

variable "db_password" {
  type      = string
  sensitive = true
}

# @piece settings-map: Everything that differs between environments
locals {
  settings = {
    staging = {
      instance_class          = "db.t4g.micro"
      backup_retention_period = 3
      deletion_protection     = false
      log_retention_days      = 7
    }
    production = {
      instance_class          = "db.t4g.medium"
      backup_retention_period = 14
      deletion_protection     = true
      log_retention_days      = 30
    }
  }
}
# @end

# @piece current-settings: The settings of the environment being planned
locals {
  current = local.settings[var.env]
}
# @end

locals {
  name     = "rice-rocket-${var.env}"
  services = ["api", "courier-matcher", "notifications"]
  tags = {
    Project     = "rice-rocket"
    Environment = var.env
    ManagedBy   = "terraform"
  }
}

# @piece database: The database, sized and protected per environment
resource "aws_db_instance" "main" {
  identifier              = local.name
  engine                  = "postgres"
  engine_version          = "17"
  instance_class          = local.current.instance_class
  allocated_storage       = 20
  username                = "rocket"
  password                = var.db_password
  backup_retention_period = local.current.backup_retention_period
  deletion_protection     = local.current.deletion_protection
  tags                    = local.tags
}
# @end

# @piece log-groups: One log group per service, kept per environment
resource "aws_cloudwatch_log_group" "service" {
  for_each          = toset(local.services)
  name              = "/${local.name}/${each.key}"
  retention_in_days = local.current.log_retention_days
  tags              = local.tags
}
# @end

output "database_identifier" {
  value = aws_db_instance.main.identifier
}

output "log_groups" {
  value = { for service, group in aws_cloudwatch_log_group.service : service => group.name }
}
