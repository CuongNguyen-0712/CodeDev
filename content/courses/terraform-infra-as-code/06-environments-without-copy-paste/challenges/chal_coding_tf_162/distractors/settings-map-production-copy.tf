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
      instance_class      = "db.t4g.medium"
      deletion_protection = true
      log_retention_days  = 30
    }
  }
}
