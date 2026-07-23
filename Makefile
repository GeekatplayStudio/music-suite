PYTHON ?= python
PIP ?= pip

.PHONY: install dev lint typecheck test run-api run-web install-web start verify format

install:
	$(PIP) install -e .

dev:
	$(PIP) install -e ".[dev]"

lint:
	ruff check .

typecheck:
	mypy audioqi apps tests

test:
	pytest -q

run-api:
	uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8008

run-web:
	cd apps/web-next && pnpm dev

install-web:
	cd apps/web-next && npm install

start:
	powershell -ExecutionPolicy Bypass -File .\start.ps1

verify:
	powershell -ExecutionPolicy Bypass -File .\verify_pipeline.ps1

format:
	ruff check . --fix
