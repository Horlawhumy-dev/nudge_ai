.PHONY: run test lint format mypy check db-migrate clean-env help

## Run the development server
run:
	.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8079

## Run the test suite
test:
	TEST_DATABASE_URL="postgresql+psycopg://haroffcode@/nudgeai_test?host=/var/run/postgresql" .venv/bin/pytest -q

## Lint with ruff
lint:
	.venv/bin/ruff check app alembic tests

## Format with ruff
format:
	.venv/bin/ruff format app alembic tests

## Type-check with mypy
mypy:
	.venv/bin/mypy app

## Full quality gate
check: lint format mypy db-migrate

## Run alembic to latest migration
db-migrate:
	.venv/bin/alembic upgrade head

## Clean test databases / scratch data
clean:
	psql -U haroffcode -c "DROP DATABASE IF EXISTS nudgeai_test; CREATE DATABASE nudgeai_test;" 2>/dev/null || true
	@echo "Test DB refreshed."

## Show this help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "} {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help