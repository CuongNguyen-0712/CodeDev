# @piece uploads-bucket: The uploads bucket, named per environment
resource "aws_s3_bucket" "uploads" {
  bucket = "rice-rocket-uploads"
  tags   = local.tags
}
