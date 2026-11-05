# Rice Rocket: where Terraform keeps its state. The state bucket is versioned and private, and
# was created once by hand. Each environment picks its own state file at init time:
#   terraform init -backend-config=backends/staging.s3.tfbackend
#   (that file holds: key = "staging/terraform.tfstate")
terraform {
  # [ ] The Terraform versions this code is written for

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    # [ ] The bucket and region that hold every state file
    # [ ] The state holds secrets: encrypt it at rest
    # [ ] Only one plan or apply at a time per state file
  }
}
