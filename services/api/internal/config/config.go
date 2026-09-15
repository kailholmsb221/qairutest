// Package config reads the service configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the full runtime configuration of the API service.
type Config struct {
	Port         int
	DatabaseURL  string
	CORSOrigins  []string
	ClockMode    string
	ClockFixedAt string
	ClockOffset  string
	AdminAPIKey  string
	SoonWindow   time.Duration
	EndingWindow time.Duration
	NextHorizon  time.Duration
	LogLevel     string
	// MigrateOnStart runs goose migrations before serving (compose / prod).
	MigrateOnStart bool
	// SeedOnStart seeds an empty database on start (compose demo).
	SeedOnStart bool
	// MapPath points at packages/map-data/building-a.json (seed + /map).
	MapPath string
	Version string
}

// Load reads the environment; every value has a sensible default for local development.
func Load() (Config, error) {
	c := Config{
		Port:           envInt("PORT", 8090),
		DatabaseURL:    env("DATABASE_URL", "postgres://campuslive:campuslive@localhost:5434/campuslive?sslmode=disable"),
		CORSOrigins:    strings.Split(env("CORS_ORIGINS", "http://localhost:3000,http://localhost:3100"), ","),
		ClockMode:      env("CLOCK_MODE", "real"),
		ClockFixedAt:   env("CLOCK_FIXED_AT", ""),
		ClockOffset:    env("CLOCK_OFFSET", "0s"),
		AdminAPIKey:    env("ADMIN_API_KEY", "dev-admin-key"),
		LogLevel:       env("LOG_LEVEL", "info"),
		MigrateOnStart: envBool("MIGRATE_ON_START", true),
		SeedOnStart:    envBool("SEED_ON_START", false),
		MapPath:        env("MAP_PATH", "../../packages/map-data/building-a.json"),
		Version:        env("APP_VERSION", "dev"),
	}
	var err error
	if c.SoonWindow, err = envDuration("SOON_WINDOW", 10*time.Minute); err != nil {
		return c, err
	}
	if c.EndingWindow, err = envDuration("ENDING_WINDOW", 5*time.Minute); err != nil {
		return c, err
	}
	if c.NextHorizon, err = envDuration("NEXT_HORIZON", 90*time.Minute); err != nil {
		return c, err
	}
	for i := range c.CORSOrigins {
		c.CORSOrigins[i] = strings.TrimSpace(c.CORSOrigins[i])
	}
	return c, nil
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	v := env(key, "")
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func envBool(key string, def bool) bool {
	v := strings.ToLower(env(key, ""))
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}
	return def
}

func envDuration(key string, def time.Duration) (time.Duration, error) {
	v := env(key, "")
	if v == "" {
		return def, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	return d, nil
}
