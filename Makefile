.PHONY: generate puzzles serve dev test

generate: ## Render templates and the static page (keeps existing puzzle packs)
	@go tool templ generate
	@go run ./cmd/generate -puzzles=false

puzzles: ## Regenerate puzzle packs
	@go tool templ generate
	@go run ./cmd/generate

serve: ## Serve public/ on :8080
	@go run ./cmd/server

dev: generate serve ## Build and serve

test:
	@go test ./...
