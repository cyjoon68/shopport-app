.PHONY: check contract dev dev-core down e2e release-check

COMPOSE := docker compose --env-file shopport-infra/.env --env-file shopport-be/.env

check:
	./scripts/check-submodules.sh
	node ./scripts/check-graphql-contract.mjs
	docker run --rm -v "$(CURDIR):/repo:ro" ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f git --redact --no-banner /repo
	pnpm --dir shopport-fe check
	pnpm --dir shopport-fe test:coverage
	pnpm --dir shopport-fe codegen
	git -C shopport-fe diff --exit-code
	pnpm --dir shopport-be check
	pnpm --dir shopport-be test:coverage
	pnpm --dir shopport-be build
	set -eu; backend_base_sha="$$(git ls-tree origin/develop shopport-be | awk '{print $$3}')"; test -n "$$backend_base_sha"; git -C shopport-be cat-file -e "$$backend_base_sha:schema.graphql"; baseline_schema="$$(mktemp)"; trap 'rm -f "$$baseline_schema"' EXIT; git -C shopport-be show "$$backend_base_sha:schema.graphql" > "$$baseline_schema"; test -s "$$baseline_schema"; pnpm --dir shopport-be check:schema "$$baseline_schema" schema.graphql

release-check: check
	pnpm --dir shopport-fe run doctor
	pnpm --dir shopport-fe build
	pnpm --dir shopport-be test:integration

contract:
	node ./scripts/check-graphql-contract.mjs

dev:
	$(COMPOSE) --profile full up --build

dev-core:
	$(COMPOSE) up --build api worker

down:
	$(COMPOSE) --profile full down

e2e:
	./scripts/run-integration-e2e.sh
