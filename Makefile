.PHONY: check contract dev dev-core down e2e

check:
	./scripts/check-submodules.sh
	node ./scripts/check-graphql-contract.mjs

contract:
	node ./scripts/check-graphql-contract.mjs

dev:
	docker compose --profile full up --build

dev-core:
	docker compose up --build api worker

down:
	docker compose --profile full down

e2e:
	./scripts/run-integration-e2e.sh
