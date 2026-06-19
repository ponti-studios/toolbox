package api

import (
	"github.com/charlesponti/trackie/internal/database"
	"github.com/gin-gonic/gin"
)

func RegisterRoutes(router *gin.Engine, db *database.DB) {
	apiGroup := router.Group("/api/v1")

	RegisterAccountRoutes(apiGroup, db)
	RegisterTransactionRoutes(apiGroup, db)
}
