"""Rewrite root-relative URLs in proxied HTML/CSS so they stay behind the preview proxy."""
import html
import re

_ATTR_URL = re.compile(
    r'(?P<prefix>\b(?:src|href|action|poster|data-src)\s*=\s*)'
    r'(?P<quote>["\'])(?P<url>/(?!/)[^"\']*)(?P=quote)',
    re.IGNORECASE,
)
_CSS_URL = re.compile(
    r"url\(\s*(?P<quote>['\"]?)(?P<url>/(?!/)[^)'\"]*)(?P=quote)\s*\)",
    re.IGNORECASE,
)
_BASE_TAG = re.compile(r"<base\b", re.IGNORECASE)
_HEAD_TAG = re.compile(r"(<head\b[^>]*>)", re.IGNORECASE)


def _prefix_url(url: str, base_path: str) -> str:
    if not url.startswith("/") or url.startswith("//"):
        return url
    if base_path and url.startswith(base_path):
        return url
    return f"{base_path}{url.lstrip('/')}"


def rewrite_html(body: str, base_path: str) -> str:
    """Prefix root-relative HTML URLs and add a base tag for relative URLs."""
    if not base_path:
        return body
    base_path = base_path.rstrip("/") + "/"

    body = _ATTR_URL.sub(
        lambda match: (
            f"{match.group('prefix')}{match.group('quote')}"
            f"{_prefix_url(match.group('url'), base_path)}{match.group('quote')}"
        ),
        body,
    )
    body = _CSS_URL.sub(
        lambda match: (
            f"url({match.group('quote')}"
            f"{_prefix_url(match.group('url'), base_path)}{match.group('quote')})"
        ),
        body,
    )

    if not _BASE_TAG.search(body):
        base_tag = f'<base href="{html.escape(base_path, quote=True)}">'
        if _HEAD_TAG.search(body):
            body = _HEAD_TAG.sub(rf"\1{base_tag}", body, count=1)
        else:
            body = base_tag + body
    return body


def rewrite_css(body: str, base_path: str) -> str:
    """Prefix root-relative URLs inside CSS url() values."""
    if not base_path:
        return body
    base_path = base_path.rstrip("/") + "/"
    return _CSS_URL.sub(
        lambda match: (
            f"url({match.group('quote')}"
            f"{_prefix_url(match.group('url'), base_path)}{match.group('quote')})"
        ),
        body,
    )
