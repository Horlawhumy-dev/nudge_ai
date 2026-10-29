# This computer's current Wi-Fi/LAN address (it changes when you switch networks).
LAN_IP := $(shell ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($$i=="src") print $$(i+1)}')

.PHONY: install start lan android ios web typecheck lint test test-watch format format-check check doctor fix-deps export-web clean help

# Use `make <target>`. Run `make` or `make help` to list targets.

install: ## Install dependencies
	npm install

start: ## Start the Expo dev server (press w for web, or scan the QR with Expo Go)
	npx expo start

lan: ## Start Expo pointed at the API on this computer's current address (use after changing networks)
	@test -n "$(LAN_IP)" || (echo "Couldn't detect your LAN address; set EXPO_PUBLIC_API_URL yourself." && exit 1)
	@echo "API: http://$(LAN_IP):8079/api/v1  (run 'make run HOST=0.0.0.0' in nudgeai_backend)"
	EXPO_PUBLIC_API_URL=http://$(LAN_IP):8079/api/v1 npx expo start -c

android: ## Start on an Android device/emulator
	npx expo start --android

ios: ## Start on an iOS simulator (macOS only)
	npx expo start --ios

web: ## Start the web build in a browser
	npx expo start --web

typecheck: ## Type-check with tsc
	npx tsc --noEmit

lint: ## Lint (ESLint + React Compiler rules)
	npx expo lint

test: ## Run the Jest test suite
	npx jest

test-watch: ## Run Jest in watch mode
	npx jest --watch

format: ## Format with Prettier
	npx prettier --write src README.md

format-check: ## Check formatting without writing
	npx prettier --check src README.md

check: typecheck lint format-check test ## Full quality gate (run before committing)

doctor: ## Diagnose dependency and config issues
	npx expo-doctor

fix-deps: ## Align dependency versions with the installed Expo SDK
	npx expo install --fix

export-web: ## Production web export to ./dist
	npx expo export --platform web

clean: ## Remove generated Expo/web build output (.expo, dist)
	rm -rf .expo dist
	@echo "Removed .expo and dist."

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "\033[36m%-14s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
