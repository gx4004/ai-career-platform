"""B10: PDF export of non-ASCII text, and cover-letter edits that persist and reach the exports.

Letter edits and the export filename/title go through the public HTTP routes (a saved run, read
back and exported); the font round trips call the PDF generators directly, the seam where the
fonts are chosen. Text is extracted from the PDF with PyMuPDF so the assertion is what a reader sees.
"""

from __future__ import annotations

import fitz

from app.models.tool_run import ToolRun
from app.services.pdf_export import generate_cover_letter_pdf, generate_interview_pdf

PREFIX = "/api/v1/history"


def _pdf_text(blob: bytes) -> str:
    doc = fitz.open(stream=blob, filetype="pdf")
    try:
        return "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()


def _letter_payload(**overrides) -> dict:
    payload = {
        "schema_version": "quality_v2",
        "summary": {"headline": "Draft", "verdict": "Draft", "confidence_note": "Advisory."},
        "opening": {
            "text": "Dear Hiring Manager,\nI am excited to apply.",
            "why_this_paragraph": "Connect fit.",
            "requirements_used": ["Python"],
            "evidence_used": [],
        },
        "body_points": [
            {
                "text": "I led a migration of three services.",
                "why_this_paragraph": "Ownership.",
                "requirements_used": ["Kubernetes"],
                "evidence_used": [],
            },
            {
                "text": "I mentor junior engineers.",
                "why_this_paragraph": "Leadership.",
                "requirements_used": [],
                "evidence_used": [],
            },
        ],
        "closing": {
            "text": "Thank you for your time.",
            "why_this_paragraph": "Close.",
            "requirements_used": [],
            "evidence_used": [],
        },
        "full_text": (
            "Dear Hiring Manager,\nI am excited to apply.\n\n"
            "I led a migration of three services.\n\nI mentor junior engineers.\n\n"
            "Thank you for your time."
        ),
        "tone_used": "Professional",
        "customization_notes": [],
    }
    payload.update(overrides)
    return payload


def _make_run(db, user_id, tool_name, payload, label="Cover Letter (Professional)"):
    run = ToolRun(user_id=user_id, tool_name=tool_name, label=label, result_payload=payload)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


# --- D13: non-ASCII text in PDF exports --------------------------------------------------


def test_cover_letter_pdf_keeps_turkish_polish_and_cyrillic_text():
    text = (
        "Sayın İşe Alım Uzmanı, Şule Öztürk adına başvuruyorum. "
        "Szanowni Państwo, Łukasz Żółć. Здравствуйте, Иван."
    )
    pdf = generate_cover_letter_pdf({"full_text": text})
    extracted = " ".join(_pdf_text(pdf).split())
    for fragment in ("Sayın İşe Alım Uzmanı", "Şule Öztürk", "Łukasz Żółć", "Здравствуйте, Иван"):
        assert fragment in extracted


def test_cover_letter_pdf_keeps_cjk_text():
    for letter, expected in (
        ("ご担当者様 日本語 の履歴書です。", "日本語"),
        ("你好,世界。 我是一名软件工程师。", "软件工程师"),
        ("안녕하세요. 저는 소프트웨어 엔지니어입니다.", "소프트웨어"),
    ):
        extracted = _pdf_text(generate_cover_letter_pdf({"full_text": letter}))
        assert expected in extracted


def test_pdf_never_prints_unrenderable_emoji_as_boxes_and_keeps_the_rest():
    pdf = generate_cover_letter_pdf({"full_text": "Launch day 🚀 went well."})
    extracted = " ".join(_pdf_text(pdf).split())
    assert "Launch day" in extracted and "went well." in extracted
    assert "�" not in extracted and "■" not in extracted


def test_interview_pdf_keeps_non_latin_questions_answers_and_points():
    payload = {
        "questions": [
            {
                "question": "Neden bu role başvurdunuz, Şirin?",
                "answer": "Çünkü güvenilirlik üzerine çalışıyorum.",
                "key_points": ["Müşteri etkisi", "日本語のポイント"],
                "answer_structure": ["Durum", "Eylem"],
            }
        ]
    }
    extracted = " ".join(_pdf_text(generate_interview_pdf(payload)).split())
    assert "Neden bu role başvurdunuz, Şirin?" in extracted
    assert "Çünkü güvenilirlik üzerine çalışıyorum." in extracted
    assert "Müşteri etkisi" in extracted
    assert "日本語のポイント" in extracted


def test_pdf_export_route_round_trips_a_non_latin_name(client, db, test_user, auth_headers):
    payload = _letter_payload()
    payload["opening"]["text"] = "Sayın İşe Alım, ben Şule Öztürk."
    run = _make_run(db, test_user.id, "cover-letter", payload)

    response = client.get(f"{PREFIX}/{run.id}/export/pdf", headers=auth_headers)

    assert response.status_code == 200
    assert "Şule Öztürk" in " ".join(_pdf_text(response.content).split())


def test_pdf_export_download_name_says_what_the_document_is(client, db, test_user, auth_headers):
    run = _make_run(db, test_user.id, "cover-letter", _letter_payload())
    response = client.get(f"{PREFIX}/{run.id}/export/pdf", headers=auth_headers)
    disposition = response.headers["content-disposition"]
    assert "cover-letter" in disposition and ".pdf" in disposition
    assert "professional" in disposition.lower()


def test_pdf_has_a_title_and_page_numbers_not_just_a_bare_dump():
    pdf = generate_cover_letter_pdf(_letter_payload())
    doc = fitz.open(stream=pdf, filetype="pdf")
    try:
        text = doc[0].get_text()
        assert "Cover Letter" in text
        assert "Page 1" in text
    finally:
        doc.close()


# --- D12: cover-letter edits are saved and used by every export --------------------------

EDIT = {
    "opening": "Dear Ms. Aydın,\nI am delighted to apply.",
    "body_points": ["I led the Kubernetes migration end to end.", "I mentor four engineers."],
    "closing": "Warm regards, Şule",
}


def test_letter_edit_persists_and_survives_a_reload(client, db, test_user, auth_headers):
    run = _make_run(db, test_user.id, "cover-letter", _letter_payload())

    saved = client.patch(f"{PREFIX}/{run.id}/letter", json=EDIT, headers=auth_headers)
    assert saved.status_code == 200

    reloaded = client.get(f"{PREFIX}/{run.id}", headers=auth_headers).json()["result_payload"]
    assert reloaded["opening"]["text"] == EDIT["opening"]
    assert [p["text"] for p in reloaded["body_points"]] == EDIT["body_points"]
    assert reloaded["closing"]["text"] == EDIT["closing"]
    # the composed text (used by Copy / TXT / MD) follows the edit too
    assert EDIT["body_points"][0] in reloaded["full_text"]
    assert "I am excited to apply" not in reloaded["full_text"]
    # the rationale and requirements that belong to each paragraph are untouched
    assert reloaded["body_points"][0]["why_this_paragraph"] == "Ownership."
    assert reloaded["body_points"][0]["requirements_used"] == ["Kubernetes"]


def test_pdf_uses_the_last_saved_edit(client, db, test_user, auth_headers):
    run = _make_run(db, test_user.id, "cover-letter", _letter_payload())
    client.patch(f"{PREFIX}/{run.id}/letter", json=EDIT, headers=auth_headers)

    response = client.get(f"{PREFIX}/{run.id}/export/pdf", headers=auth_headers)

    text = " ".join(_pdf_text(response.content).split())
    assert "I am delighted to apply." in text
    assert "I mentor four engineers." in text
    assert "Warm regards, Şule" in text
    assert "I am excited to apply" not in text


def test_a_second_edit_replaces_the_first(client, db, test_user, auth_headers):
    run = _make_run(db, test_user.id, "cover-letter", _letter_payload())
    client.patch(f"{PREFIX}/{run.id}/letter", json=EDIT, headers=auth_headers)
    second = {**EDIT, "closing": "Best, S."}
    client.patch(f"{PREFIX}/{run.id}/letter", json=second, headers=auth_headers)

    payload = client.get(f"{PREFIX}/{run.id}", headers=auth_headers).json()["result_payload"]
    assert payload["closing"]["text"] == "Best, S."


def test_letter_edit_must_keep_the_paragraph_count(client, db, test_user, auth_headers):
    run = _make_run(db, test_user.id, "cover-letter", _letter_payload())
    response = client.patch(
        f"{PREFIX}/{run.id}/letter", json={**EDIT, "body_points": ["only one"]}, headers=auth_headers
    )
    assert response.status_code == 422
    unchanged = client.get(f"{PREFIX}/{run.id}", headers=auth_headers).json()["result_payload"]
    assert unchanged["opening"]["text"].startswith("Dear Hiring Manager")


def test_letter_edit_rejects_oversized_paragraphs(client, db, test_user, auth_headers):
    run = _make_run(db, test_user.id, "cover-letter", _letter_payload())
    response = client.patch(
        f"{PREFIX}/{run.id}/letter", json={**EDIT, "opening": "x" * 10_001}, headers=auth_headers
    )
    assert response.status_code == 422


def test_letter_edit_only_for_cover_letter_runs(client, db, test_user, auth_headers):
    run = _make_run(db, test_user.id, "interview", {"questions": []}, label="Interview Prep")
    response = client.patch(f"{PREFIX}/{run.id}/letter", json=EDIT, headers=auth_headers)
    assert response.status_code == 400


def test_letter_edit_is_owner_only(client, db, test_user, auth_headers):
    from app.auth.security import hash_password
    from app.models.user import User

    other = User(email="other@example.com", hashed_password=hash_password("password123"), full_name="O")
    db.add(other)
    db.commit()
    run = _make_run(db, other.id, "cover-letter", _letter_payload())

    response = client.patch(f"{PREFIX}/{run.id}/letter", json=EDIT, headers=auth_headers)

    assert response.status_code == 404
    db.refresh(run)
    assert run.result_payload["opening"]["text"].startswith("Dear Hiring Manager")


def test_letter_edit_requires_login(client, db, test_user):
    run = _make_run(db, test_user.id, "cover-letter", _letter_payload())
    assert client.patch(f"{PREFIX}/{run.id}/letter", json=EDIT).status_code == 401
