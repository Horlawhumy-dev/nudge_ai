# Root helpers for the whole repo. Each project keeps its own Makefile; these call into them.
# Use `make <target>`. Run `make` or `make help` to list targets.

BACKEND := nudgeai_backend
MOBILE  := nudgeai_mobile

.PHONY: install install-backend install-mobile api worker worker-once app web migrate \
	lint typecheck test test-backend test-mobile check check-backend check-mobile clean help

install: install-backend install-mobile ## Install backend and mobile dependencies

install-backend: ## Create the backend virtualenv and install it
	cd $(BACKEND) && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"

install-mobile: ## Install the mobile dependencies
	$(MAKE) -C $(MOBILE) install

api: ## Run the API on :8079
	$(MAKE) -C $(BACKEND) run

worker: ## Run the nudge worker loop (separate terminal)
	$(MAKE) -C $(BACKEND) worker

worker-once: ## Run a single worker pass
	$(MAKE) -C $(BACKEND) worker-once

app: ## Start the Expo dev server
	$(MAKE) -C $(MOBILE) start

web: ## Start the mobile app in a browser
	$(MAKE) -C $(MOBILE) web

migrate: ## Apply database migrations (uses DATABASE_URL from nudgeai_backend/.env)
	$(MAKE) -C $(BACKEND) db-migrate

lint: ## Lint the backend and the mobile app
	$(MAKE) -C $(BACKEND) lint
	$(MAKE) -C $(MOBILE) lint

typecheck: ## Type-check the backend (mypy) and the mobile app (tsc)
	$(MAKE) -C $(BACKEND) mypy
	$(MAKE) -C $(MOBILE) typecheck

test: test-backend test-mobile ## Run every test suite

test-backend: ## Backend tests (needs the nudgeai_test database)
	$(MAKE) -C $(BACKEND) test

test-mobile: ## Mobile tests
	$(MAKE) -C $(MOBILE) test

check: check-backend check-mobile ## Full quality gate for both projects (read-only: no formatting, no migrations)

check-backend:
	$(MAKE) -C $(BACKEND) lint mypy test

check-mobile:
	$(MAKE) -C $(MOBILE) check

clean: ## Remove mobile build output
	$(MAKE) -C $(MOBILE) clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
