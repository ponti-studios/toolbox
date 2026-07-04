package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/charlesponti/trackie/internal/api"
	"github.com/charlesponti/trackie/internal/database"
	"github.com/gin-gonic/gin"
)

func main() {
	port := flag.String("port", "", "Override server port")
	flag.Parse()

	serverPort := getEnv("PORT", "8080")
	if *port != "" {
		serverPort = *port
	}

	db, err := database.New("")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open local database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(gin.Logger())

	api.RegisterRoutes(router, db)

	srv := &http.Server{
		Addr:    ":" + serverPort,
		Handler: router,
	}

	go func() {
		log.Printf("trackie listening on port %s", serverPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down trackie")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
