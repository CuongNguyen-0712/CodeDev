# @piece uploads-versioning: Keep old versions of every uploaded object
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = "rice-rocket-staging-uploads"
  versioning_configuration {
    status = "Enabled"
  }
}
