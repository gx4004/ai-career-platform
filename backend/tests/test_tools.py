from app.models.tool_run import ToolRun

PREFIX = "/api/v1"


def test_resume_analyze(client, auth_headers, mock_ai_result):
    mock_ai_result(
        {
            "summary": {
                "headline": "Promising resume with a few high-value fixes.",
                "verdict": "Promising but uneven",
                "confidence_note": "Directional heuristic only.",
            },
            "strengths": ["Clear formatting"],
            "issues": [
                {
                    "id": "impact-1",
                    "severity": "high",
                    "category": "impact",
                    "title": "Add metrics",
                    "why_it_matters": "Numbers improve credibility.",
                    "evidence": "Most bullets are qualitative.",
                    "fix": "Quantify 2-3 bullets.",
                }
            ],
        }
    )
    resp = client.post(
        f"{PREFIX}/resume/analyze",
        json={
            "resume_text": "Professional Summary\nPython engineer with SQL experience.\nExperience\n- Built APIs for 3 internal teams.\nSkills\nPython, SQL\nEducation\nBS Computer Science",
            "job_description": "Backend Engineer\nNeed Python, SQL, APIs, and cloud deployment experience.",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == "quality_v2"
    assert data["summary"]["headline"]
    assert data["summary"]["confidence_note"]
    assert data["overall_score"] >= 0
    assert len(data["score_breakdown"]) == 5
    assert {item["key"] for item in data["score_breakdown"]} == {
        "keywords",
        "impact",
        "structure",
        "clarity",
        "completeness",
    }
    assert data["strengths"]
    assert data["issues"][0]["category"] in {
        "keywords",
        "impact",
        "structure",
        "clarity",
        "completeness",
    }
    assert "Python" in data["evidence"]["detected_skills"]
    assert data["role_fit"]["fit_score"] >= 0
    assert "history_id" in data
    assert data["access_mode"] == "authenticated"
    assert data["saved"] is True
    assert data["download_title"]
    assert data["exportable_sections"]
    assert data["editable_blocks"]


def test_resume_analyze_guest_demo_does_not_persist_history(client, db, mock_ai_result):
    mock_ai_result(
        {
            "summary": {
                "headline": "Promising resume with a few high-value fixes.",
                "verdict": "Promising but uneven",
                "confidence_note": "Directional heuristic only.",
            },
            "strengths": ["Clear formatting"],
            "issues": [],
        }
    )
    resp = client.post(
        f"{PREFIX}/resume/analyze",
        json={
            "resume_text": "Professional Summary\nPython engineer.\nExperience\n- Built APIs.\nSkills\nPython",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["access_mode"] == "guest_demo"
    assert data["saved"] is False
    assert data["locked_actions"] == ["save", "favorite", "continue", "history"]
    assert db.query(ToolRun).count() == 0


def test_job_match(client, auth_headers, mock_ai_result):
    mock_ai_result(
        {
            "requirements": [
                {
                    "requirement": "Python",
                    "importance": "must",
                    "status": "matched",
                    "resume_evidence": "Python is listed in skills and experience.",
                    "suggested_fix": "Keep Python visible in impact bullets.",
                },
                {
                    "requirement": "Kubernetes",
                    "importance": "preferred",
                    "status": "missing",
                    "resume_evidence": "No Kubernetes evidence was found.",
                    "suggested_fix": "Add adjacent deployment experience or a project example.",
                },
            ],
            "tailoring_actions": [
                {
                    "section": "experience",
                    "keyword": "Kubernetes",
                    "action": "Add deployment ownership to the strongest backend bullet.",
                }
            ],
            "interview_focus": ["Deployment trade-offs"],
            "recruiter_summary": "Good backend match with one clear infrastructure gap.",
        }
    )
    resp = client.post(
        f"{PREFIX}/job-match/match",
        json={
            "resume_text": "Experience\n- Built Python APIs and SQL services for customer-facing products.\nSkills\nPython, SQL, FastAPI",
            "job_description": "Backend Engineer\nNeed Python, SQL, FastAPI, and Kubernetes experience.",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == "quality_v2"
    assert data["match_score"] >= 0
    assert data["verdict"] in {"strong", "borderline", "stretch"}
    assert data["requirements"]
    assert data["requirements"][0]["importance"] in {"must", "preferred"}
    assert data["requirements"][0]["status"] in {"matched", "partial", "missing"}
    assert data["matched_keywords"]
    assert "Kubernetes" in data["missing_keywords"]
    assert data["tailoring_actions"]
    assert data["interview_focus"]
    assert data["recruiter_summary"]
    assert data["saved"] is True
    assert data["download_title"]
    assert len(data["exportable_sections"]) >= 3


def test_cover_letter(client, auth_headers, mock_ai_result):
    mock_ai_result(
        {
            "summary": {
                "headline": "The draft is targeted and ready for a stronger evidence pass.",
                "verdict": "Application-ready draft",
                "confidence_note": "Advisory draft only.",
            },
            "opening": {
                "text": "Dear Hiring Manager,\n\nI am excited to apply for the Backend Engineer role.",
                "why_this_paragraph": "Connect fit quickly.",
                "requirements_used": ["Python", "SQL"],
                "evidence_used": ["Built APIs for customer teams."],
            },
            "body_points": [
                {
                    "text": "I have built backend services with measurable impact.",
                    "why_this_paragraph": "Show proof.",
                    "requirements_used": ["AWS"],
                    "evidence_used": ["Improved reliability by 20%."],
                }
            ],
            "closing": {
                "text": "Thank you for your consideration.",
                "why_this_paragraph": "Close confidently.",
                "requirements_used": ["Backend Engineer"],
                "evidence_used": [],
            },
            "full_text": "Dear Hiring Manager...\n\nThank you for your consideration.",
            "tone_used": "Professional",
            "customization_notes": [
                {
                    "category": "keyword",
                    "note": "Make AWS ownership more explicit.",
                    "requirements_used": ["AWS"],
                    "source": "job-match",
                }
            ],
        }
    )
    resp = client.post(
        f"{PREFIX}/cover-letter/generate",
        json={
            "resume_text": "Engineer with 5 years",
            "job_description": "Senior role",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == "quality_v2"
    assert data["summary"]["headline"]
    assert data["opening"]["why_this_paragraph"]
    assert data["body_points"]
    assert "Dear" in data["full_text"]
    assert data["tone_used"] == "Professional"
    assert data["customization_notes"]
    assert data["saved"] is True
    assert data["download_title"]
    assert data["exportable_sections"]
    assert data["editable_blocks"]


def test_interview(client, auth_headers, mock_ai_result):
    mock_ai_result(
        {
            "summary": {
                "headline": "Start with the weak-signal topics first.",
                "verdict": "Gap-first practice plan",
                "confidence_note": "Advisory prep only.",
            },
            "questions": [
                {
                    "question": "Tell me about yourself",
                    "answer": "I am...",
                    "key_points": ["Experience", "Skills"],
                    "answer_structure": ["Situation", "Task", "Action", "Result"],
                    "follow_up_questions": ["What changed because of your work?"],
                    "focus_area": "Backend foundations",
                    "why_asked": "To understand your fit quickly.",
                    "practice_first": False,
                }
            ],
            "focus_areas": [
                {
                    "title": "Backend foundations",
                    "reason": "This role needs immediate backend credibility.",
                    "requirements_used": ["Python", "SQL"],
                    "practice_first": False,
                }
            ],
            "weak_signals_to_prepare": [
                {
                    "title": "Kubernetes",
                    "severity": "high",
                    "why_it_matters": "No direct orchestration example is visible.",
                    "prep_action": "Prepare one adjacent infrastructure example.",
                    "related_requirements": ["Kubernetes"],
                }
            ],
            "interviewer_notes": ["Lead with your strongest API story."],
        }
    )
    resp = client.post(
        f"{PREFIX}/interview/questions",
        json={
            "resume_text": "Developer",
            "job_description": "Backend role",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == "quality_v2"
    assert len(data["questions"]) == 5
    assert data["questions"][0]["answer_structure"]
    assert data["focus_areas"]
    assert data["weak_signals_to_prepare"]
    assert data["interviewer_notes"]
    assert data["saved"] is True
    assert data["download_title"]
    assert data["exportable_sections"]
    assert data["editable_blocks"]


def test_career(client, auth_headers, mock_ai_result):
    mock_ai_result(
        {
            "recommended_direction": {
                "role_title": "Senior Backend Engineer",
                "fit_score": 81,
                "transition_timeline": "3-6 months",
                "why_now": "The resume already shows the core backend stack and only needs stronger leadership proof.",
                "confidence": "medium",
            },
            "paths": [
                {
                    "role_title": "Senior Backend Engineer",
                    "fit_score": 81,
                    "transition_timeline": "3-6 months",
                    "rationale": "This is the strongest same-discipline growth move.",
                    "strengths_to_leverage": ["Python", "APIs"],
                    "gaps_to_close": ["Leadership", "Observability"],
                    "risk_level": "medium",
                }
            ],
            "current_skills": ["Python"],
            "target_skills": ["System Design"],
            "skill_gaps": [
                {
                    "skill": "Leadership",
                    "urgency": "high",
                    "why_it_matters": "Senior roles need broader scope evidence.",
                    "how_to_build": "Own a cross-team initiative and document the result.",
                }
            ],
            "next_steps": [
                {
                    "timeframe": "Next 30 days",
                    "action": "Add one proof point that shows ownership beyond implementation.",
                }
            ],
        }
    )
    resp = client.post(
        f"{PREFIX}/career/recommend",
        json={"resume_text": "Senior developer"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == "planning_v1"
    assert data["summary"]["headline"]
    assert data["top_actions"]
    assert data["recommended_direction"]["role_title"] == "Senior Backend Engineer"
    assert len(data["paths"]) == 1
    assert data["paths"][0]["risk_level"] in {"low", "medium", "high"}
    assert data["skill_gaps"][0]["urgency"] in {"high", "medium", "low"}
    assert data["next_steps"][0]["timeframe"]
    assert data["saved"] is True
    assert data["download_title"]
    assert data["exportable_sections"]


def test_portfolio(client, auth_headers, mock_ai_result):
    mock_ai_result(
        {
            "portfolio_strategy": {
                "headline": "Build a tight backend proof set.",
                "focus": "Start with one operational service and then deepen production signals.",
                "proof_goal": "Make the backend role feel earned before interviews.",
            },
            "projects": [
                {
                    "project_title": "Operational Intake Service",
                    "description": "Build a production-leaning backend workflow.",
                    "skills": ["FastAPI"],
                    "complexity": "foundational",
                    "why_this_project": "It proves core backend ownership quickly.",
                    "deliverables": ["README", "Deployed service"],
                    "hiring_signals": ["API design", "Testing"],
                    "estimated_timeline": "2-3 weeks",
                }
            ],
            "recommended_start_project": "Operational Intake Service",
            "sequence_plan": [
                {
                    "order": 1,
                    "project_title": "Operational Intake Service",
                    "reason": "This is the fastest credible proof move.",
                }
            ],
            "presentation_tips": ["Explain the trade-offs, not just the features."],
        }
    )
    resp = client.post(
        f"{PREFIX}/portfolio/recommend",
        json={"resume_text": "Junior dev", "target_role": "Backend Engineer"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == "planning_v1"
    assert data["summary"]["headline"]
    assert data["top_actions"]
    assert data["target_role"] == "Backend Engineer"
    assert data["portfolio_strategy"]["headline"]
    assert len(data["projects"]) == 1
    assert data["projects"][0]["complexity"] in {"foundational", "intermediate", "advanced"}
    assert data["recommended_start_project"] == "Operational Intake Service"
    assert data["sequence_plan"][0]["order"] == 1
    assert data["presentation_tips"]
    assert data["saved"] is True
    assert data["download_title"]
    assert data["exportable_sections"]


def test_frontend_telemetry_ingest(client):
    resp = client.post(
        f"{PREFIX}/telemetry/events",
        json={
            "event_name": "result_page_loaded",
            "tool_id": "resume",
            "access_mode": "guest_demo",
            "route": "/resume/result/demo-1",
            "saved": False,
            "metadata": {"format": "md"},
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"accepted": True}


def test_guest_demo_run_does_not_create_history(client, db, mock_ai_result):
    mock_ai_result(
        {
            "summary": {
                "headline": "Promising resume with a few high-value fixes.",
                "verdict": "Promising but uneven",
                "confidence_note": "Directional heuristic only.",
            },
            "strengths": ["Clear formatting"],
            "issues": [],
        }
    )

    resp = client.post(
        f"{PREFIX}/resume/analyze",
        json={
            "resume_text": "Professional Summary\nPython engineer with SQL experience.\nExperience\n- Built APIs for 3 internal teams.\nSkills\nPython, SQL\nEducation\nBS Computer Science",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["history_id"] is None
    assert data["access_mode"] == "guest_demo"
    assert data["saved"] is False
    assert data["locked_actions"] == ["save", "favorite", "continue", "history"]
    assert data["download_title"]
    assert data["exportable_sections"]
    assert db.query(ToolRun).count() == 0


def test_workspace_context_links_related_runs(client, auth_headers, db, mock_ai_result):
    mock_ai_result(
        {
            "summary": {
                "headline": "Promising resume with a few high-value fixes.",
                "verdict": "Promising but uneven",
                "confidence_note": "Directional heuristic only.",
            },
            "strengths": ["Clear formatting"],
            "issues": [],
        }
    )
    resume_resp = client.post(
        f"{PREFIX}/resume/analyze",
        json={
            "resume_text": "Professional Summary\nPython engineer with SQL experience.\nExperience\n- Built APIs for 3 internal teams.\nSkills\nPython, SQL\nEducation\nBS Computer Science",
        },
        headers=auth_headers,
    )
    assert resume_resp.status_code == 200
    resume_history_id = resume_resp.json()["history_id"]

    mock_ai_result(
        {
            "requirements": [
                {
                    "requirement": "Python",
                    "importance": "must",
                    "status": "matched",
                    "resume_evidence": "Python is listed in skills and experience.",
                    "suggested_fix": "Keep Python visible in impact bullets.",
                }
            ],
            "tailoring_actions": [],
            "interview_focus": [],
            "recruiter_summary": "Good match.",
        }
    )
    match_resp = client.post(
        f"{PREFIX}/job-match/match",
        json={
            "resume_text": "Python engineer with SQL experience.",
            "job_description": "Backend Engineer with Python and SQL.",
            "workspace_context": {
                "linked_history_ids": [resume_history_id],
            },
        },
        headers=auth_headers,
    )
    assert match_resp.status_code == 200

    history_resp = client.get("/api/v1/history/workspaces", headers=auth_headers)
    assert history_resp.status_code == 200
    workspace = history_resp.json()["items"][0]
    assert len(workspace["linked_run_ids"]) == 2
