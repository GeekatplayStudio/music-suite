PYTHON ?= python
PIP ?= pip

.PHONY: install dev lint typecheck test run-api run-web install-web install-ai install-stems start verify format

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

# Build the local AI music engine and download its models (about 5.3 GB).
install-ai:
	$(PYTHON) -m audioqi.generation.setup --yes

# AI stem separation: 6 stems, drum kit pieces, lead/backing vocals (uses the GPU when present).
install-stems:
	$(PYTHON) -m audioqi.addons install stems

start:
	powershell -ExecutionPolicy Bypass -File .\start.ps1

verify:
	powershell -ExecutionPolicy Bypass -File .\verify_pipeline.ps1

format:
	ruff check . --fix
