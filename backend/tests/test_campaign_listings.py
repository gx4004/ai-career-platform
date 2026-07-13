from datetime import UTC, datetime

from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.data_export import CareerDataExport
from app.schemas.tools import ImportedJobResponse
from app.services.import_source import set_import_outcome


def _workspace(db, user_id: str) -> Workspace:
    workspace = Workspace(user_id=user_id, label="Target role")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def test_paste_attaches_and_replaces_one_canonical_listing(client, auth_headers, test_user, db):
    workspace = _workspace(db, test_user.id)
    first = client.post(
        "/api/v1/job-posts/import-text",
        headers=auth_headers,
        json={
            "campaign_id": workspace.id,
            "job_title": "Platform Engineer",
            "company_name": "Example Corp",
            "job_description": "Build reliable Python platforms for customers.",
        },
    )
    assert first.status_code == 200
    assert first.json()["source_url"] is None
    assert first.json()["retrieved_at"].endswith(("Z", "+00:00"))

    second = client.post(
        "/api/v1/job-posts/import-text",
        headers=auth_headers,
        json={
            "campaign_id": workspace.id,
            "job_title": "Senior Platform Engineer",
            "company_name": "Example Corp",
            "job_description": "Own reliable Python and Kubernetes platforms.",
        },
    )
    assert second.status_code == 200
    listings = db.query(CampaignListing).filter_by(workspace_id=workspace.id).all()
    assert len(listings) == 2
    db.refresh(workspace)
    assert workspace.listing.title == "Senior Platform Engineer"
    assert listings[0].title == "Platform Engineer"
    events = db.query(CampaignEvent).filter_by(workspace_id=workspace.id).all()
    assert [event.event_type for event in events] == [
        "listing_attached",
        "listing_attached",
    ]
    assert events[-1].details == {"source_family": "paste", "outcome": "replaced"}


def test_listing_attachment_is_owner_isolated(client, auth_headers, test_user, db):
    other = User(email="other@example.com", hashed_password="irrelevant")
    db.add(other)
    db.commit()
    workspace = _workspace(db, other.id)

    response = client.post(
        "/api/v1/job-posts/import-text",
        headers=auth_headers,
        json={
            "campaign_id": workspace.id,
            "job_title": "Engineer",
            "company_name": "Private Corp",
            "job_description": "A sufficiently detailed private role description.",
        },
    )
    assert response.status_code == 404
    assert db.query(CampaignListing).count() == 0


def test_url_import_reuses_scraper_and_attaches_listing(
    client, auth_headers, test_user, db, monkeypatch
):
    workspace = _workspace(db, test_user.id)
    called = []

    async def fake_scrape(url: str) -> ImportedJobResponse:
        called.append(url)
        set_import_outcome("success")
        return ImportedJobResponse(
            job_title="Backend Engineer",
            company_name="Example Corp",
            job_description="Build secure Python APIs and reliable data services.",
            source_url=url,
        )

    monkeypatch.setattr("app.routers.job_posts.scrape_job_posting", fake_scrape)
    url = "https://boards.greenhouse.io/example/jobs/123?ref=private"
    response = client.post(
        "/api/v1/job-posts/import-url",
        headers=auth_headers,
        json={"url": url, "campaign_id": workspace.id},
    )
    assert response.status_code == 200
    assert called == [url]
    listing = db.query(CampaignListing).one()
    assert listing.source_url == url
    event = db.query(CampaignEvent).filter_by(event_type="listing_attached").one()
    assert event.details == {"source_family": "greenhouse", "outcome": "attached"}


def test_failed_url_import_preserves_current_listing(
    client, auth_headers, test_user, db, monkeypatch
):
    workspace = _workspace(db, test_user.id)
    existing = CampaignListing(
        workspace_id=workspace.id,
        title="Existing role",
        company="Existing company",
        description="The previously imported canonical listing remains authoritative.",
        source_url="https://example.com/existing",
        retrieved_at=datetime.now(UTC),
    )
    db.add(existing)
    db.commit()

    async def failed_scrape(url: str) -> ImportedJobResponse:
        set_import_outcome("failure")
        return ImportedJobResponse(
            job_description="Could not extract the job description. Please copy and paste it.",
            source_url=url,
        )

    monkeypatch.setattr("app.routers.job_posts.scrape_job_posting", failed_scrape)
    response = client.post(
        "/api/v1/job-posts/import-url",
        headers=auth_headers,
        json={"url": "https://example.com/unavailable", "campaign_id": workspace.id},
    )
    assert response.status_code == 200
    db.refresh(existing)
    assert existing.title == "Existing role"
    assert db.query(CampaignEvent).filter_by(event_type="listing_attached").count() == 0


def test_incomplete_url_import_does_not_invent_canonical_fields(
    client, auth_headers, test_user, db, monkeypatch
):
    workspace = _workspace(db, test_user.id)

    async def incomplete_scrape(url: str) -> ImportedJobResponse:
        set_import_outcome("success")
        return ImportedJobResponse(
            job_title=None,
            company_name=None,
            job_description="A complete description whose heading could not be extracted.",
            source_url=url,
        )

    monkeypatch.setattr("app.routers.job_posts.scrape_job_posting", incomplete_scrape)
    response = client.post(
        "/api/v1/job-posts/import-url",
        headers=auth_headers,
        json={"url": "https://example.com/incomplete", "campaign_id": workspace.id},
    )
    assert response.status_code == 422
    assert db.query(CampaignListing).count() == 0


def test_listing_is_exported_and_account_deletion_removes_it(client, auth_headers, test_user, db):
    workspace = _workspace(db, test_user.id)
    client.post(
        "/api/v1/job-posts/import-text",
        headers=auth_headers,
        json={
            "campaign_id": workspace.id,
            "job_title": "Engineer",
            "company_name": "Example Corp",
            "job_description": "Build reliable Python systems for customers.",
        },
    )
    exported = CareerDataExport.model_validate(
        client.get("/api/v1/evidence-profile/export", headers=auth_headers).json()
    )
    listing = exported.campaigns.campaigns[0].listing
    assert listing is not None
    assert listing.description == "Build reliable Python systems for customers."
    assert [item.title for item in exported.campaigns.campaigns[0].listing_revisions] == [
        "Engineer"
    ]

    response = client.post(
        "/api/v1/auth/me/delete",
        headers=auth_headers,
        json={"confirmation": test_user.email},
    )
    assert response.status_code == 204
    assert db.query(CampaignListing).count() == 0


def test_paste_listing_content_is_bounded(client, auth_headers, test_user, db):
    workspace = _workspace(db, test_user.id)
    response = client.post(
        "/api/v1/job-posts/import-text",
        headers=auth_headers,
        json={
            "campaign_id": workspace.id,
            "job_title": "Engineer",
            "company_name": "Example Corp",
            "job_description": "x" * 20_001,
        },
    )
    assert response.status_code == 422
    assert db.query(CampaignListing).count() == 0

    spoofed = client.post(
        "/api/v1/job-posts/import-text",
        headers=auth_headers,
        json={
            "campaign_id": workspace.id,
            "job_title": "Engineer",
            "company_name": "Example Corp",
            "job_description": "A sufficiently detailed pasted role description.",
            "source_url": "https://attacker.example/jobs/1",
            "source_family": "greenhouse",
        },
    )
    assert spoofed.status_code == 422
    assert db.query(CampaignListing).count() == 0


def test_campaign_deletion_cascades_listing(db, test_user):
    workspace = _workspace(db, test_user.id)
    db.add(
        CampaignListing(
            workspace_id=workspace.id,
            title="Engineer",
            company="Example Corp",
            description="Build reliable systems.",
            source_url=None,
            retrieved_at=datetime.now(UTC),
        )
    )
    db.commit()
    db.delete(workspace)
    db.commit()
    assert db.query(CampaignListing).count() == 0


def test_owner_can_delete_campaign_and_listing_immediately(client, auth_headers, test_user, db):
    workspace = _workspace(db, test_user.id)
    db.add(
        CampaignListing(
            workspace_id=workspace.id,
            title="Engineer",
            company="Example Corp",
            description="Build reliable systems for customers and internal teams.",
            retrieved_at=datetime.now(UTC),
        )
    )
    db.commit()
    response = client.delete(f"/api/v1/history/workspaces/{workspace.id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
    assert db.query(Workspace).filter_by(id=workspace.id).first() is None
    assert db.query(CampaignListing).count() == 0
