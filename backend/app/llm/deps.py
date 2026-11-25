"""Late-bound access to teammates' modules (app.db, app.services).

Resolved through ``importlib`` at call time so the LLM package imports cleanly
even before those modules exist, and so tests can substitute fakes via
``sys.modules``.
"""

from __future__ import annotations

import importlib
from types import ModuleType


def db() -> ModuleType:
    return importlib.import_module("app.db")


def services() -> ModuleType:
    return importlib.import_module("app.services")
