.PHONY: generate puzzles serve dev test cf-deploy deploy

STACK ?= penciled-in
AWS_REGION ?= us-east-1
DOMAIN ?= sudoku.codypotter.com

generate: ## Render templates and the page; generates puzzle packs only if missing
	@go tool templ generate
	@go run ./cmd/generate

puzzles: ## Overwrite all puzzle packs with fresh ones
	@go tool templ generate
	@go run ./cmd/generate -regen

serve: ## Serve public/ on :8080
	@go run ./cmd/server

dev: generate serve ## Build and serve

test:
	@go test ./...

## Deployment (see infra.yaml)

cf-deploy: ## Create/update the CloudFormation stack (needs HOSTED_ZONE_ID for the parent domain)
	@test -n "$(HOSTED_ZONE_ID)" || (echo "Set HOSTED_ZONE_ID to the Route53 zone ID for codypotter.com"; exit 1)
	@aws cloudformation deploy --template-file infra.yaml --stack-name $(STACK) --region $(AWS_REGION) \
		--parameter-overrides DomainName=$(DOMAIN) HostedZoneId=$(HOSTED_ZONE_ID)

deploy: ## Build, sync public/ to S3 and invalidate CloudFront
	@STACK=$(STACK) AWS_REGION=$(AWS_REGION) bash scripts/deploy.sh
