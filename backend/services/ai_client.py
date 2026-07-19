"""
Unified AI client — all AI calls go through OpenRouter's single endpoint.

Strategy:
  1. Try free-tier model first (fast, no cost)
  2. Fall back to paid latest-alias flagship on error/rate-limit
  3. Keep JSON-parsing safety net for markdown-fenced responses
"""

import os
import json
import logging
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

logger = logging.getLogger(__name__)

# ── OpenRouter client (OpenAI-compatible) ──────────────────────────────
_api_key = os.getenv("OPENROUTER_API_KEY", "")

_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=_api_key,
) if _api_key else None

# Model tiers — free first, paid fallback
FREE_MODEL = "openrouter/free"
PAID_MODEL = "google/gemini-2.5-flash"


def _get_client() -> OpenAI:
    """Return the configured client, or raise if no key is set."""
    global _client, _api_key
    key = os.getenv("OPENROUTER_API_KEY", "")
    if key and key != _api_key:
        _api_key = key
        _client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=key)
    if not _client:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")
    return _client


# ── JSON parsing safety net ────────────────────────────────────────────

def parse_json(text: str) -> dict:
    """Parse JSON from model output, reliably extracting it even if there's a preamble."""
    try:
        text = text.strip()
        start = text.find('{')
        start_list = text.find('[')
        if start == -1 or (start_list != -1 and start_list < start):
            start = start_list
            
        end = text.rfind('}')
        end_list = text.rfind(']')
        if end == -1 or (end_list != -1 and end_list > end):
            end = end_list
            
        if start != -1 and end != -1:
            json_str = text[start:end+1]
            return json.loads(json_str)
        
        # Fallback if no braces found
        return json.loads(text)
    except Exception as e:
        return {"error": "Failed to parse JSON", "raw": text, "exception": str(e)}


# ── Core chat function ─────────────────────────────────────────────────

def chat(
    prompt: str,
    system: str = "You are a helpful financial advisor.",
    max_tokens: int = 1200,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    """
    Send a chat completion request through OpenRouter.

    Tries the free model first.  If it errors or rate-limits, retries once
    with the paid flagship model.

    Returns the raw text content from the model response.
    """
    client = _get_client()

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]

    kwargs = dict(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    # Attempt 1 — free model
    try:
        resp = client.chat.completions.create(model=FREE_MODEL, **kwargs)
        content = resp.choices[0].message.content
        if content:
            return content
        raise ValueError("Empty response from free model")
    except Exception as free_err:
        logger.warning(f"Free model ({FREE_MODEL}) failed: {free_err}")

    # Attempt 2 — paid fallback
    try:
        resp = client.chat.completions.create(model=PAID_MODEL, **kwargs)
        content = resp.choices[0].message.content
        if content:
            return content
        raise ValueError("Empty response from paid model")
    except Exception as paid_err:
        logger.error(f"Paid model ({PAID_MODEL}) also failed: {paid_err}")
        raise RuntimeError(
            f"Both AI models failed. "
            f"Free: {free_err} | Paid: {paid_err}"
        )


def chat_json(
    prompt: str,
    system: str = "You are a helpful financial advisor. Respond only in valid JSON.",
    max_tokens: int = 1200,
    temperature: float = 0.5,
) -> dict:
    """Convenience wrapper: calls chat() then parse_json(). Retries with PAID_MODEL if parsing fails."""
    raw = chat(prompt, system=system, max_tokens=max_tokens, temperature=temperature, json_mode=True)
    parsed = parse_json(raw)
    
    # If the free model returned garbage that couldn't be parsed, force the paid model
    if "error" in parsed and "raw" in parsed:
        logger.warning(f"JSON parsing failed for free model. Forcing fallback to {PAID_MODEL}...")
        client = _get_client()
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        try:
            resp = client.chat.completions.create(
                model=PAID_MODEL,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format={"type": "json_object"}
            )
            raw = resp.choices[0].message.content
            parsed = parse_json(raw)
        except Exception as e:
            logger.error(f"Fallback to paid model also failed: {e}")
            
    return parsed

def chat_with_tools(
    messages: list,
    tools: list = None,
    max_tokens: int = 1200,
    temperature: float = 0.5,
):
    """
    Send a chat completion request with tool calling support.
    Returns the message object (which contains .content or .tool_calls).
    """
    client = _get_client()
    kwargs = dict(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    if tools:
        kwargs["tools"] = tools

    # Tool calling is complex, we bypass FREE_MODEL and use PAID_MODEL directly for reliability
    try:
        resp = client.chat.completions.create(model=PAID_MODEL, **kwargs)
        return resp.choices[0].message
    except Exception as e:
        logger.error(f"chat_with_tools failed: {e}")
        raise
