# Use `make <target>`. Run `make` or `make help` to list targets.

# Bind address. Use `make run HOST=0.0.0.0` so a phone on your Wi-Fi can reach the API.
HOST ?= 127.0.0.1
# Your reserved ngrok domain, e.g. NGROK_DOMAIN=your-name.ngrok-free.app
NGROK_DOMAIN ?=
TEST_DATABASE_URL ?= postgresql+psycopg://haroffcode@/nudgeai_test?host=/var/run/postgresql

.PHONY: install tunnel run worker worker-once test lint format format-check mypy check db-migrate clean help

install: ## Create the virtualenv and install the app with its dev tools
	python3 -m venv .venv
	.venv/bin/pip install -e ".[dev]"

run: ## Run the API on :8079 (HOST=0.0.0.0 to reach it from a phone)
	.venv/bin/uvicorn app.main:app --host $(HOST) --port 8079

tunnel: ## Expose the API at https://$(NGROK_DOMAIN) (make tunnel NGROK_DOMAIN=...); keep `make run` going too
	@test -n "$(NGROK_DOMAIN)" || (echo "Usage: make tunnel NGROK_DOMAIN=<your-name>.ngrok-free.app" && exit 1)
	ngrok http --url=$(NGROK_DOMAIN) 8079

worker: ## Run the nudge worker loop (separate terminal)
	.venv/bin/python -m app.engine.worker

worker-once: ## Run a single nudge worker pass
	.venv/bin/python -m app.engine.worker --once

db-migrate: ## Apply database migrations (uses DATABASE_URL from .env)
	.venv/bin/alembic upgrade head

test: ## Run the test suite against the nudgeai_test database
	TEST_DATABASE_URL="$(TEST_DATABASE_URL)" .venv/bin/pytest -q

lint: ## Lint with ruff
	.venv/bin/ruff check app alembic tests

format: ## Format with ruff (rewrites files)
	.venv/bin/ruff format app alembic tests

format-check: ## Check formatting without changing files
	.venv/bin/ruff format --check app alembic tests

mypy: ## Type-check with mypy
	.venv/bin/mypy app

check: lint format-check mypy test ## Full quality gate (read-only: no formatting, no migrations)

clean: ## Recreate the nudgeai_test database
	psql -U haroffcode -c "DROP DATABASE IF EXISTS nudgeai_test;" -c "CREATE DATABASE nudgeai_test;" 2>/dev/null || true
	@echo "Test DB refreshed (the pgvector extension may need enabling by a superuser)."

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "\033[36m%-14s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
