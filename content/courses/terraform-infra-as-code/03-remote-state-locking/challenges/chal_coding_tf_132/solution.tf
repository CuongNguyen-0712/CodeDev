# Rice Rocket: where Terraform keeps its state. The state bucket is versioned and private, and
# was created once by hand. Each environment picks its own state file at init time:
#   terraform init -backend-config=backends/staging.s3.tfbackend
#   (that file holds: key = "staging/terraform.tfstate")
terraform {
  # @piece required-version: The Terraform versions this code is written for
  required_version = ">= 1.11.0, < 2.0.0"
  # @end

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    # @piece state-bucket: The bucket and region that hold every state file
    bucket = "rice-rocket-terraform-state"
    region = "ap-southeast-1"
    # @end
    # @piece state-encryption: The state holds secrets: encrypt it at rest
    encrypt = true
    # @end
    # @piece state-locking: Only one plan or apply at a time per state file
    use_lockfile = true
    # @end
  }
}
