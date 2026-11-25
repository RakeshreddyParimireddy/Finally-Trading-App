"""LLM call via LiteLLM -> OpenRouter -> Cerebras with structured outputs."""

from __future__ import annotations

import asyncio
import os

from .schema import LLMResponse, parse_llm_response

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}
TIMEOUT_SECONDS = 60


class LLMUnavailableError(Exception):
    """No API key configured."""


class LLMCallError(Exception):
    """The LLM call failed or returned an unusable response."""


def is_mock_mode() -> bool:
    return os.getenv("LLM_MOCK", "false").strip().lower() == "true"


def has_api_key() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY", "").strip())


def _call_sync(messages: list[dict]) -> str | None:
    from litellm import completion  # imported lazily: litellm import is slow

    response = completion(
        model=MODEL,
        messages=messages,
        response_format=LLMResponse,
        reasoning_effort="low",
        extra_body=EXTRA_BODY,
        timeout=TIMEOUT_SECONDS,
    )
    return response.choices[0].message.content


async def call_llm(messages: list[dict]) -> LLMResponse:
    """Call the real LLM and parse its structured response.

    Raises LLMUnavailableError if no key is configured, LLMCallError on any
    network, provider or parsing failure.
    """
    if not has_api_key():
        raise LLMUnavailableError("OPENROUTER_API_KEY is not set")
    try:
        raw = await asyncio.to_thread(_call_sync, messages)
    except Exception as exc:  # network/provider errors of any kind
        raise LLMCallError(f"LLM request failed: {exc}") from exc
    try:
        return parse_llm_response(raw)
    except ValueError as exc:
        raise LLMCallError(str(exc)) from exc
