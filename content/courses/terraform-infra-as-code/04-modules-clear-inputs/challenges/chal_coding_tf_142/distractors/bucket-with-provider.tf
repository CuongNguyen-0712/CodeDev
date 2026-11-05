# @piece bucket: The site bucket, named from env and site name
provider "aws" {
  region = "ap-southeast-1"
}

resource "aws_s3_bucket" "this" {
  bucket = "rice-rocket-${var.env}-${var.name}"
  tags   = merge(var.tags, { Site = var.name })
}
