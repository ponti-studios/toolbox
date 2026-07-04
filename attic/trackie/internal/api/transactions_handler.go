package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/charlesponti/trackie/internal/database"
	"github.com/charlesponti/trackie/internal/operations"
	"github.com/gin-gonic/gin"
)

func RegisterTransactionRoutes(group *gin.RouterGroup, db *database.DB) {
	group.GET("/transactions", func(c *gin.Context) {
		limit := 20
		offset := 0
		if value := c.Query("limit"); value != "" {
			if parsed, err := strconv.Atoi(value); err == nil {
				limit = parsed
			}
		}
		if value := c.Query("offset"); value != "" {
			if parsed, err := strconv.Atoi(value); err == nil {
				offset = parsed
			}
		}
		if limit <= 0 {
			limit = 20
		}
		if offset < 0 {
			offset = 0
		}
		result, err := operations.ListTransactions(c.Request.Context(), db, operations.ListTransactionsInput{
			Limit:     limit,
			Offset:    offset,
			AccountID: c.Query("accountId"),
			Category:  c.Query("category"),
			StartDate: c.Query("startDate"),
			EndDate:   c.Query("endDate"),
			Kind:      c.Query("kind"),
		})
		if err != nil {
			writeError(c, err)
			return
		}
		c.JSON(200, result)
	})

	group.POST("/transactions", func(c *gin.Context) {
		var input operations.CreateTransactionInput
		if err := c.ShouldBindJSON(&input); err != nil {
			writeError(c, fmt.Errorf("validation: invalid request payload"))
			return
		}
		result, err := operations.CreateTransaction(c.Request.Context(), db, input)
		if err != nil {
			writeError(c, err)
			return
		}
		c.JSON(200, result)
	})

	group.PUT("/transactions/:id", func(c *gin.Context) {
		transactionID := c.Param("id")
		var input operations.UpdateTransactionInput
		if err := c.ShouldBindJSON(&input); err != nil {
			writeError(c, fmt.Errorf("validation: invalid request payload"))
			return
		}
		result, err := operations.UpdateTransaction(c.Request.Context(), db, transactionID, input)
		if err != nil {
			writeError(c, err)
			return
		}
		c.JSON(200, result)
	})

	group.DELETE("/transactions/:id", func(c *gin.Context) {
		transactionID := c.Param("id")
		err := operations.DeleteTransaction(c.Request.Context(), db, transactionID)
		if err != nil {
			writeError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	})
}
