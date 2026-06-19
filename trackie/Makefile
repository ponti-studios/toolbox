SHELL := /bin/sh

.PHONY: build-server build-cli test run-server run-cli

build-server:
	go build ./cmd/server

build-cli:
	go build ./cmd/cli

test:
	go test ./...

run-server:
	go run ./cmd/server

run-cli:
	go run ./cmd/cli
