"""
Paperclip SDK - Error types
"""

from typing import Any, Optional


class PaperclipError(Exception):
    """Base exception for Paperclip SDK errors."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details

    def __repr__(self) -> str:
        return f"PaperclipError(status={self.status}, code={self.code!r}, message={self.message!r})"

    def __str__(self) -> str:
        return f"[{self.code}] {self.message}"

    def is_not_found(self) -> bool:
        """Returns True if the error is a 404 Not Found."""
        return self.status == 404

    def isUnauthorized(self) -> bool:
        """Returns True if the error is a 401 Unauthorized."""
        return self.status == 401

    def is_forbidden(self) -> bool:
        """Returns True if the error is a 403 Forbidden."""
        return self.status == 403

    def is_server_error(self) -> bool:
        """Returns True if the error is a 5xx server error."""
        return 500 <= self.status < 600
