#!/bin/sh
set -eu

create_bucket() {
  bucket="$1"
  if ! awslocal s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    awslocal s3api create-bucket \
      --bucket "$bucket" \
      --create-bucket-configuration LocationConstraint=ap-northeast-2
  fi
}

create_bucket shopport-assets-raw
create_bucket shopport-assets-normalized
create_bucket shopport-archives
awslocal sqs create-queue --queue-name shopport-asset-results
awslocal sqs create-queue --queue-name shopport-asset-results-dlq
