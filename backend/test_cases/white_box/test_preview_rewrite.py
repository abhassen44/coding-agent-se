"""Tests for preview HTML/CSS URL rewriting."""
from app.services.preview_rewrite import rewrite_css, rewrite_html

BASE = "/api/v1/workspace/1/proxy/tok/8000/"


def test_rewrites_root_relative_assets_and_injects_base():
    html = '<html><head><title>x</title></head><body><script src="/app.js"></script><a href="/docs">docs</a></body></html>'
    out = rewrite_html(html, BASE)

    assert f'src="{BASE}app.js"' in out
    assert f'href="{BASE}docs"' in out
    assert f'<base href="{BASE}">' in out


def test_does_not_rewrite_absolute_or_special_urls():
    html = (
        '<a href="https://example.com/x"></a>'
        '<img src="//cdn.example.com/x.png">'
        '<img src="data:image/png;base64,abc">'
        '<a href="mailto:x@example.com">mail</a>'
        '<a href="#section">section</a>'
    )
    out = rewrite_html(html, BASE)

    assert "https://example.com/x" in out
    assert "//cdn.example.com/x.png" in out
    assert "data:image/png;base64,abc" in out
    assert "mailto:x@example.com" in out
    assert "#section" in out


def test_is_idempotent():
    html = '<script src="/app.js"></script>'
    once = rewrite_html(html, BASE)
    twice = rewrite_html(once, BASE)
    assert twice.count(f'src="{BASE}app.js"') == 1


def test_rewrites_css_urls():
    css = 'body{background:url("/bg.png")} .x{background:url(/icons/x.svg)}'
    out = rewrite_css(css, BASE)
    assert f'url("{BASE}bg.png")' in out
    assert f"url({BASE}icons/x.svg)" in out
