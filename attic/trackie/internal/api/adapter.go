package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func writeError(c *gin.Context, err error) {
	msg := err.Error()
	status := http.StatusInternalServerError
	body := gin.H{"error": "system", "message": msg}

	switch {
	case strings.HasPrefix(msg, "validation:"):
		status = http.StatusBadRequest
		body["error"] = "validation"
	case strings.HasPrefix(msg, "not_found:"):
		status = http.StatusNotFound
		body["error"] = "not_found"
	case strings.HasPrefix(msg, "system:"):
		body["error"] = "system"
	default:
		body["message"] = fmt.Sprintf("%v", err)
	}

	c.JSON(status, body)
}
