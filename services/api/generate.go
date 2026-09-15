// Package api — code generation entry points.
//
//	go generate ./...                      # oapi-codegen (server + models from packages/contracts/openapi.yaml)
//	docker run --rm -v "$PWD:/src" -w /src sqlc/sqlc:1.30.0 generate   # sqlc (queries → internal/repo/db)
package api

//go:generate go tool oapi-codegen -config oapi-codegen.yaml ../../packages/contracts/openapi.yaml
