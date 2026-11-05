# @piece outputs: What callers may use: the bucket name and ARN
output "bucket" {
  value = aws_s3_bucket.this
}

output "bucket_arn" {
  value = aws_s3_bucket.this.arn
}
