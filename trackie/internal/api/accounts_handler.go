package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/charlesponti/trackie/internal/database"
	"github.com/charlesponti/trackie/internal/operations"
	"github.com/gin-gonic/gin"
)

func RegisterAccountRoutes(group *gin.RouterGroup, db *database.DB) {
	group.GET("/accounts", func(c *gin.Context) {
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
		accounts, err := operations.ListAccounts(c.Request.Context(), db, limit, offset, c.Query("type"))
		if err != nil {
			writeError(c, err)
			return
		}
		c.JSON(200, accounts)
	})

	group.POST("/accounts", func(c *gin.Context) {
		var input operations.CreateAccountInput
		if err := c.ShouldBindJSON(&input); err != nil {
			writeError(c, fmt.Errorf("validation: invalid request payload"))
			return
		}
		account, err := operations.CreateAccount(c.Request.Context(), db, input)
		if err != nil {
			writeError(c, err)
			return
		}
		c.JSON(200, account)
	})

	group.PUT("/accounts/:id", func(c *gin.Context) {
		accountID := c.Param("id")
		var input operations.UpdateAccountInput
		if err := c.ShouldBindJSON(&input); err != nil {
			writeError(c, fmt.Errorf("validation: invalid request payload"))
			return
		}
		account, err := operations.UpdateAccount(c.Request.Context(), db, accountID, input)
		if err != nil {
			writeError(c, err)
			return
		}
		c.JSON(200, account)
	})

	group.DELETE("/accounts/:id", func(c *gin.Context) {
		accountID := c.Param("id")
		err := operations.DeleteAccount(c.Request.Context(), db, accountID)
		if err != nil {
			writeError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	})
}
