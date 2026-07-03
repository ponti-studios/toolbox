"""Shared exception types for the package."""


class ToolError(Exception):
    """Base exception for package errors."""


class ConfigError(ToolError):
    """Configuration-related errors."""


class DatabaseError(ToolError):
    """Database-related errors."""


class APIError(ToolError):
    """Remote API errors."""


class ValidationError(ToolError):
    """Input or data validation errors."""
