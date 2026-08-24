.PHONY: check contract dev dev-core down e2e

COMPOSE := docker compose --env-file shopport-infra/.env --env-file shopport-be/.env

check:
	./scripts/check-submodules.sh
	node ./scripts/check-graphql-contract.mjs

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
