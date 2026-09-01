"""CoinDCX credentials + live-trading switch, editable at runtime from the UI.

Values live in Mongo (`settings` collection) so keys can be rotated without a redeploy.
`backend/.env` still works as a fallback, and env values win only when the database has
nothing stored. The secret is never returned to the client — only a masked tail.
"""
from __future__ import annotations

import os
from contextvars import ContextVar
from typing import Any

from lib.db import db

_DOC_ID = "coindcx"
_current_user: ContextVar[str] = ContextVar("coindcx_user", default="admin")
_cache: dict[str, Any] = {"api_key": "", "api_secret": "", "live_trading": False, "loaded": False}
_states: dict[str, dict[str, Any]] = {}


def set_user(user_id: str) -> None:
    _current_user.set(user_id.strip().lower() or "admin")


def user_id() -> str:
    return _current_user.get()


def _state() -> dict[str, Any]:
    if user_id() == "admin":
        return _cache
    return _states.setdefault(user_id(), {"api_key": "", "api_secret": "", "live_trading": False, "loaded": False})


def _settings_id() -> str:
    return f"{_DOC_ID}:{user_id()}"


def mask(value: str) -> str:
    if not value:
        return ""
    return f"{'*' * max(4, len(value) - 4)}{value[-4:]}"


async def load() -> None:
    doc = None
    try:
        doc = await db.settings.find_one({"_id": _settings_id()})
    except Exception:
        doc = None
    if doc:
        _state().update(
            api_key=doc.get("api_key") or "",
            api_secret=doc.get("api_secret") or "",
            live_trading=bool(doc.get("live_trading")),
        )
    else:
        _state().update(
            api_key=os.environ.get("COINDCX_API_KEY") or "",
            api_secret=os.environ.get("COINDCX_API_SECRET") or "",
            live_trading=False,
        )
    _state()["loaded"] = True


async def ensure_loaded() -> None:
    """Retry Mongo-backed loading when startup happened before Mongo was ready."""
    if not configured():
        await load()


async def save(api_key: str, api_secret: str) -> None:
    _state().update(api_key=api_key.strip(), api_secret=api_secret.strip())
    await db.settings.update_one(
        {"_id": _settings_id()},
        {"$set": {"api_key": _state()["api_key"], "api_secret": _state()["api_secret"]}},
        upsert=True,
    )


async def clear() -> None:
    _state().update(api_key="", api_secret="", live_trading=False)
    await db.settings.update_one(
        {"_id": _settings_id()},
        {"$set": {"api_key": "", "api_secret": "", "live_trading": False}},
        upsert=True,
    )


async def set_live(on: bool) -> None:
    _state()["live_trading"] = bool(on) and configured()
    await db.settings.update_one(
        {"_id": _settings_id()}, {"$set": {"live_trading": _state()["live_trading"]}}, upsert=True
    )


def credentials() -> tuple[str, str]:
    return str(_state()["api_key"]), str(_state()["api_secret"])


def configured() -> bool:
    return bool(_state()["api_key"] and _state()["api_secret"])


def live_enabled() -> bool:
    return bool(_state()["live_trading"]) and configured()


def status() -> dict[str, Any]:
    return {
        "configured": configured(),
        "api_key_masked": mask(str(_state()["api_key"])),
        "api_secret_masked": mask(str(_state()["api_secret"])),
        "live_trading": live_enabled(),
    }
