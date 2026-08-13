#!/bin/sh
set -eu

awslocal s3api create-bucket \
  --bucket shopport-assets \
  --create-bucket-configuration LocationConstraint=ap-northeast-2
awslocal sqs create-queue --queue-name shopport-asset-results
awslocal sqs create-queue --queue-name shopport-asset-results-dlq
