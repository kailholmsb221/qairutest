// Package migrations embeds the goose SQL migrations so the binary can migrate on start.
package migrations

import "embed"

// FS contains every *.sql migration.
//
//go:embed *.sql
var FS embed.FS
