#!/bin/sh
set -eu

for path in shopport-fe shopport-be shopport-infra; do
  expected="$(git ls-tree HEAD "$path" | awk '{print $3}')"
  if [ -z "$expected" ]; then
    echo "$path is not recorded as a gitlink" >&2
    exit 1
  fi
  if [ ! -e "$path/.git" ]; then
    echo "$path is not initialized; run git submodule update --init --recursive" >&2
    exit 1
  fi
  actual="$(git -C "$path" rev-parse HEAD)"
  if [ "$actual" != "$expected" ]; then
    echo "$path SHA mismatch: BOM=$expected checkout=$actual" >&2
    exit 1
  fi
done

git submodule status --recursive
