"""B14 item 12: text dropped for missing glyphs fails only the honest "Reads back" check."""

from __future__ import annotations

import pytest

PREFIX = "/api/v1/cv-documents"


def _section(kind, title, position, body):
    return {
        "id": f"section-{kind}",
        "kind": kind,
        "title": title,
        "visible": True,
        "position": position,
        "entries": [{"id": f"{kind}-0", "evidence_item_id": None, "body": body, "position": 0}],
    }


def _checks(client, headers, sections):
    document = client.post(PREFIX, json={"name": "Glyphs", "sections": sections}, headers=headers)
    assert document.status_code == 201, document.text
    response = client.post(f"{PREFIX}/{document.json()['id']}/quality", headers=headers)
    assert response.status_code == 200
    return {check["id"]: check for check in response.json()["checks"]}


@pytest.mark.parametrize(
    "first_line",
    [
        "日本語テスト Backend engineer at Northwind.",  # unsupported text leads the entry
        "Backend engineer 😀 at Northwind building payment APIs.",  # an emoji mid-line
        "Built APIs😀fast for Northwind.",  # an emoji inside a word
        "Shipped the 日本語 rollout for Northwind.",  # unsupported text between words
    ],
)
def test_missing_glyphs_do_not_fail_the_page_break_check(client, auth_headers, first_line):
    checks = _checks(
        client,
        auth_headers,
        [
            _section("summary", "Summary", 0, "Platform engineer building reliable services."),
            _section("experience", "Experience", 1, first_line),
            _section("skills", "Skills", 2, "Python, SQL"),
        ],
    )

    assert checks["reads_back"]["passed"] is False
    assert "cannot draw" in checks["reads_back"]["fix"]
    assert checks["page_breaks"]["passed"] is True, checks["page_breaks"]
