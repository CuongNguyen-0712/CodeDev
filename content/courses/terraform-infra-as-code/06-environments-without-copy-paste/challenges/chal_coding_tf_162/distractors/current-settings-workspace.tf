# @piece current-settings: The settings of the environment being planned
locals {
  current = local.settings[terraform.workspace == "production" ? "production" : "staging"]
}
