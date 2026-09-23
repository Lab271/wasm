FRONTEND := frontend
BACKEND  := backend
HOST     ?= 127.0.0.1
PORT     ?= 8000

.DEFAULT_GOAL := help
.PHONY: help install build serve test test-backend test-frontend lint clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

$(FRONTEND)/node_modules: $(FRONTEND)/package.json
	npm --prefix $(FRONTEND) install
	@touch $@

install: $(FRONTEND)/node_modules ## Install frontend (npm) and backend (uv) dependencies
	uv --directory $(BACKEND) sync

build: $(FRONTEND)/node_modules ## Compile the AssemblyScript engine to WASM and build the React app
	npm --prefix $(FRONTEND) run build

serve: build ## Build and serve the game (default http://127.0.0.1:8000, override HOST/PORT)
	uv --directory $(BACKEND) run uvicorn duckhunt_server.app:app --host $(HOST) --port $(PORT)

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests (pytest)
	uv --directory $(BACKEND) run pytest

test-frontend: $(FRONTEND)/node_modules ## Run WASM engine and frontend tests (vitest)
	npm --prefix $(FRONTEND) test

lint: $(FRONTEND)/node_modules ## Lint backend (ruff) and typecheck frontend (tsc)
	uv --directory $(BACKEND) run ruff check .
	uv --directory $(BACKEND) run ruff format --check .
	npm --prefix $(FRONTEND) run typecheck

clean: ## Remove build artifacts
	rm -rf $(FRONTEND)/dist $(FRONTEND)/public/duckhunt.wasm
