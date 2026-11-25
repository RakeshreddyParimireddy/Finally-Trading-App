"""LLM model/provider selection via LLM_MODEL and LLM_PROVIDER env vars."""

from app.llm import client

# conftest's autouse guard replaces client._call_sync during each test; keep the
# real one (litellm.completion is faked below, so no network call is made).
_real_call_sync = client._call_sync


def test_defaults_to_gpt_oss_on_cerebras(monkeypatch):
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert client.get_model() == "openrouter/openai/gpt-oss-120b"
    assert client.get_extra_body() == {"provider": {"order": ["cerebras"]}}


def test_model_override(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "  openrouter/openai/gpt-oss-120b:free ")
    assert client.get_model() == "openrouter/openai/gpt-oss-120b:free"


def test_blank_model_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "  ")
    assert client.get_model() == client.DEFAULT_MODEL


def test_provider_override(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    assert client.get_extra_body() == {"provider": {"order": ["groq"]}}


def test_empty_or_any_provider_disables_pinning(monkeypatch):
    for value in ("", "any", "ANY"):
        monkeypatch.setenv("LLM_PROVIDER", value)
        assert client.get_extra_body() == {}


def test_call_sync_passes_model_and_omits_empty_extra_body(monkeypatch):
    import litellm

    captured = {}

    class _Msg:
        content = '{"message": "ok"}'

    class _Choice:
        message = _Msg()

    class _Resp:
        choices = [_Choice()]

    def fake_completion(**kwargs):
        captured.update(kwargs)
        return _Resp()

    monkeypatch.setattr(litellm, "completion", fake_completion)
    monkeypatch.setenv("LLM_MODEL", "openrouter/openai/gpt-oss-120b:free")
    monkeypatch.setenv("LLM_PROVIDER", "any")

    assert _real_call_sync([{"role": "user", "content": "hi"}]) == '{"message": "ok"}'
    assert captured["model"] == "openrouter/openai/gpt-oss-120b:free"
    assert "extra_body" not in captured
