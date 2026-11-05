# @piece moved-web: Keep the existing web bucket under its new address
moved {
  from = aws_s3_bucket.web
  to   = aws_s3_bucket.site["www"]
}
