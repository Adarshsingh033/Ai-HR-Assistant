"""
Centralized logging configuration for the AI HR Assistant backend.

Provides two log files:
  - logs/app.log   → INFO+ level (all application activity)
  - logs/error.log → ERROR+ level (only errors and exceptions)

Usage in any module:
    from app.logger import get_logger
    logger = get_logger(__name__)
    logger.info("Server started")
    logger.error("Something failed", exc_info=True)
"""

import os
import logging
from logging.handlers import RotatingFileHandler

# Resolve log directory relative to this file (backend/logs/)
_LOG_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "logs"))
os.makedirs(_LOG_DIR, exist_ok=True)

_LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_MAX_BYTES = 5 * 1024 * 1024  # 5 MB per log file
_BACKUP_COUNT = 5             # Keep 5 rotated backups


def _create_file_handler(filename: str, level: int) -> RotatingFileHandler:
    """Create a rotating file handler with the given level."""
    filepath = os.path.join(_LOG_DIR, filename)
    handler = RotatingFileHandler(
        filepath,
        maxBytes=_MAX_BYTES,
        backupCount=_BACKUP_COUNT,
        encoding="utf-8",
    )
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
    return handler


def _create_console_handler() -> logging.StreamHandler:
    """Create a console handler for development output."""
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
    return handler


# Module-level flag to ensure root logger is configured only once
_configured = False


def _configure_root_logger() -> None:
    """Configure the root 'app' logger with file and console handlers."""
    global _configured
    if _configured:
        return

    root_logger = logging.getLogger("app")
    root_logger.setLevel(logging.DEBUG)

    # Prevent duplicate handlers on reload
    if not root_logger.handlers:
        root_logger.addHandler(_create_file_handler("app.log", logging.INFO))
        root_logger.addHandler(_create_file_handler("error.log", logging.ERROR))
        root_logger.addHandler(_create_console_handler())

    _configured = True


def get_logger(name: str) -> logging.Logger:
    """
    Get a named logger under the 'app' namespace.

    Args:
        name: Usually ``__name__`` of the calling module.

    Returns:
        A configured ``logging.Logger`` instance.
    """
    _configure_root_logger()
    return logging.getLogger(f"app.{name}")
