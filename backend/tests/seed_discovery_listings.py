"""Seed realistic job listings for the screenshots harness (E2E only).

Not imported by the production app. The harness database has no ingested
listings and must never hit the network, so this inserts a few governed
employer-ATS sources, ~20 listings attributed to them, and a handful of
confirmed Evidence Profile skills for the harness user so the Job Discovery page
shows match scores. Same shape as tests.promote_admin: it writes straight to the
database DATABASE_URL points at.

Usage: python -m tests.seed_discovery_listings <email>
"""

from __future__ import annotations

import hashlib
import sys
from datetime import UTC, datetime, timedelta

import app.models  # noqa: F401  (register every mapper)
from app.database import SessionLocal
from app.models.discovered_listing import DiscoveredListing, DiscoveredListingAttribution
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.models.user import User

ENDPOINTS = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
    "lever": "https://api.lever.co/v0/postings/{slug}",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{slug}",
}

# (provider, company, title, department, location, remote, days_ago, description)
LISTINGS = [
    ("greenhouse", "Northwind Labs", "Senior Backend Engineer, Platform", "Engineering",
     "Berlin, Germany", True, 1,
     "Own the Python and FastAPI services behind our billing platform. You will design "
     "PostgreSQL schemas, lead migrations, and build CI/CD pipelines with Docker on AWS."),
    ("greenhouse", "Northwind Labs", "Staff Data Engineer", "Data", "Berlin, Germany", False, 4,
     "Build streaming data pipelines with Python, Kafka and PostgreSQL. Partner with "
     "analytics to model data and keep the warehouse reliable."),
    ("greenhouse", "Brightline", "Backend Engineer, Payments", "Engineering", "London, UK", True, 2,
     "Build reliable payment APIs in Python. Experience with SQLAlchemy, PostgreSQL and "
     "event-driven systems is a plus. You will mentor engineers and review designs."),
    ("greenhouse", "Brightline", "Product Designer", "Design", "London, UK", False, 9,
     "Shape the end-to-end experience of our merchant dashboard. Run research, prototype "
     "in Figma and work closely with engineering."),
    ("greenhouse", "Brightline", "Engineering Manager, Core Services", "Engineering",
     "Remote - Europe", True, 6,
     "Lead a team of six backend engineers building core Python services. Coach, hire and "
     "keep delivery predictable across quarterly releases."),
    ("lever", "Harbor Health", "Platform Engineer", "Infrastructure", "Amsterdam, Netherlands",
     True, 3,
     "Run our Kubernetes and Terraform platform on AWS. Improve CI/CD, observability and "
     "developer tooling for 40 product engineers."),
    ("lever", "Harbor Health", "Senior Frontend Engineer", "Engineering", "Amsterdam, Netherlands",
     False, 5,
     "Build patient-facing web apps with React and TypeScript. Care about accessibility, "
     "performance and design systems."),
    ("lever", "Harbor Health", "Data Analyst", "Analytics", "Remote - EU", True, 12,
     "Answer product questions with SQL and Python. Build dashboards and help teams make "
     "decisions from data."),
    ("lever", "Tidewater", "Site Reliability Engineer", "Infrastructure", "Dublin, Ireland",
     False, 8,
     "Keep our services fast and available. On-call, incident response, Kubernetes, "
     "PostgreSQL tuning and capacity planning."),
    ("lever", "Tidewater", "Python Developer, Integrations", "Engineering", "Dublin, Ireland",
     True, 0,
     "Build integrations with partner APIs in Python and FastAPI. Write clean tests, "
     "document APIs and work with support to resolve issues."),
    ("lever", "Tidewater", "Account Executive, Mid-Market", "Sales", "Dublin, Ireland", False, 15,
     "Own a mid-market territory, run discovery calls, and close new business. Two years of "
     "SaaS sales experience required."),
    ("ashby", "Lumen AI", "Machine Learning Engineer", "Research", "San Francisco, CA", False, 2,
     "Train and ship ranking models. Strong Python, PyTorch and data pipeline experience. "
     "You will own models from research to production."),
    ("ashby", "Lumen AI", "Backend Engineer, Inference", "Engineering", "Remote - US", True, 1,
     "Build low-latency inference APIs in Python and Go. Work on caching, queueing and "
     "autoscaling on Kubernetes."),
    ("ashby", "Lumen AI", "Technical Writer", "Developer Relations", "Remote - US", True, 20,
     "Write clear guides and API references for developers. Work with engineering to "
     "document new features."),
    ("ashby", "Quarry", "Full-Stack Engineer", "Engineering", "Toronto, Canada", True, 4,
     "Ship features across a React and TypeScript frontend and a Python backend. PostgreSQL, "
     "Docker and AWS experience helps."),
    ("ashby", "Quarry", "Customer Success Manager", "Customer Success", "Toronto, Canada",
     False, 11,
     "Help customers get value from Quarry. Run onboarding, quarterly reviews and renewals."),
    ("ashby", "Quarry", "Security Engineer", "Security", "Remote - Canada", True, 7,
     "Harden our cloud infrastructure on AWS, run threat modeling and lead incident response."),
    ("greenhouse", "Northwind Labs", "DevOps Engineer", "Infrastructure", "Munich, Germany",
     False, 3,
     "Automate deployments with Docker and Terraform, improve CI/CD pipelines and monitoring "
     "across our AWS accounts."),
    ("lever", "Harbor Health", "Head of Product", "Product", "Amsterdam, Netherlands", False, 25,
     "Set product strategy for our care platform and lead a team of five product managers."),
    ("ashby", "Lumen AI", "Recruiter, Technical", "People", "San Francisco, CA", False, 13,
     "Partner with engineering leaders to hire great people. Own the process from sourcing "
     "to offer."),
]

# A second paragraph per listing (what the job asks for and offers), so the
# drawer reads like a real posting and fit has more than one keyword to rest on.
DETAILS = {
    "Senior Backend Engineer, Platform": "You bring five or more years of backend work, "
    "strong Python, solid SQL and a habit of writing tests first. Experience with Redis "
    "or Kafka is welcome. We offer a four-day week, a learning budget and remote-friendly hours.",
    "Staff Data Engineer": "You have run Python and SQL pipelines in production and enjoy "
    "mentoring. Airflow, dbt or Spark experience helps. We offer a hybrid week in Berlin "
    "and a clear path to principal.",
    "Backend Engineer, Payments": "You write clear Python, care about idempotency and "
    "reconciliation, and are comfortable on call. Docker and AWS are part of the daily work.",
    "Product Designer": "You have shipped a design system, can run a usability study in a "
    "week and write about your decisions. Experience with data-heavy dashboards is a plus.",
    "Engineering Manager, Core Services": "You have managed engineers for two or more years, "
    "stay close to the code and give direct feedback. Experience with Python, AWS and "
    "incident reviews is expected.",
    "Platform Engineer": "You have run Kubernetes in production, written Terraform modules "
    "and cut deploy times. Python or Go scripting, Prometheus and Grafana are a plus.",
    "Senior Frontend Engineer": "You have shipped React and TypeScript at scale, test with "
    "Jest and Playwright, and treat accessibility as a requirement, not a polish step.",
    "Data Analyst": "You are fluent in SQL, can explain a result to a non-technical "
    "colleague and have used Tableau, Looker or Metabase. Python and statistics help.",
    "Site Reliability Engineer": "You have carried a pager, written post-mortems and "
    "automated away toil with Python or Go. Terraform, Prometheus and AWS experience is expected.",
    "Python Developer, Integrations": "You have built REST integrations, handled retries and "
    "rate limits, and write tests with pytest. Docker and PostgreSQL experience is a plus.",
    "Account Executive, Mid-Market": "You have carried a quota, can multi-thread a deal and "
    "keep clean notes in Salesforce. Experience selling to engineering teams is a plus.",
    "Machine Learning Engineer": "You have deployed models behind an API, measured them "
    "online and fixed data quality issues. PyTorch, Python, SQL and Docker are daily tools.",
    "Backend Engineer, Inference": "You have profiled latency, tuned queues and written "
    "Python or Go services that stay up under load. Docker, Kubernetes and AWS experience helps.",
    "Technical Writer": "You have documented an API or developer tool, can read code and "
    "keep docs in Git next to it. Experience with OpenAPI and Markdown tooling is a plus.",
    "Full-Stack Engineer": "You like owning a feature from the database to the browser, "
    "write tests at every layer and review code kindly. React, TypeScript and Python are daily tools.",
    "Customer Success Manager": "You have managed a book of accounts, spotted churn early "
    "and partnered with product. Experience in B2B SaaS is a plus.",
    "Security Engineer": "You have run a cloud security review, written detection rules and "
    "led an incident. Python scripting, Terraform and CI/CD security checks are expected.",
    "DevOps Engineer": "You have owned a deployment pipeline end to end, written Terraform "
    "and cut build times. Python scripting, Kubernetes and Prometheus experience is a plus.",
    "Head of Product": "You have led product managers, set a roadmap with data and shipped "
    "in regulated environments. You write clearly and run a calm planning cycle.",
    "Recruiter, Technical": "You have hired engineers end to end, can read a resume for "
    "signal and keep candidates informed. Experience with Greenhouse or Lever is a plus.",
}

SKILLS = [
    "Python, FastAPI, SQLAlchemy",
    "PostgreSQL schema design and migrations",
    "Docker, AWS, CI/CD pipelines",
    "Mentored four engineers",
]


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m tests.seed_discovery_listings <email>", file=sys.stderr)
        return 2
    now = datetime.now(UTC)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == argv[0]).one_or_none()
        if user is None:
            print("not-found")
            return 1
        sources: dict[str, DiscoverySource] = {}
        for provider, company, *_rest in LISTINGS:
            slug = company.lower().replace(" ", "")
            key = f"employer-ats-{provider}-{slug}"
            if key in sources:
                continue
            source = db.query(DiscoverySource).filter_by(source_key=key).one_or_none()
            if source is None:
                source = DiscoverySource(
                    source_key=key,
                    display_name=company,
                    source_family="employer_ats",
                    owner="Screenshots harness",
                    terms_status="accepted",
                    terms_reviewed_at=now,
                    terms_reviewed_by="screenshots-harness",
                    allowed_behavior="ats_integration",
                    endpoint_url=ENDPOINTS[provider].format(slug=slug),
                    rate_limit_per_minute=10,
                    attribution_rule="Show the company name, the source name and the original link",
                    retention_days=45,
                    kill_switch=False,
                )
                db.add(source)
                db.flush()
            sources[key] = source

        for provider, company, title, department, location, remote, days, description in LISTINGS:
            description = f"{description} {DETAILS[title]}" if title in DETAILS else description
            digest = hashlib.sha256(f"{title}|{company}|{description}".encode()).hexdigest()
            existing = (
                db.query(DiscoveredListing).filter_by(title=title, company=company).first()
            )
            if existing is not None:
                # Re-seeding refreshes the text and the posting date, so the demo
                # data never goes stale or duplicates.
                existing.content_sha256 = digest
                existing.description = description
                existing.posted_at = now - timedelta(days=days, hours=3)
                for attribution in existing.attributions:
                    attribution.retrieved_at = now
                continue
            listing = DiscoveredListing(
                content_sha256=digest,
                title=title,
                company=company,
                description=description,
                location=location,
                remote=remote,
                posted_at=now - timedelta(days=days, hours=3),
                apply_url=f"https://careers.example.com/{digest[:12]}",
                department=department,
            )
            db.add(listing)
            db.flush()
            source = sources[f"employer-ats-{provider}-{company.lower().replace(' ', '')}"]
            db.add(
                DiscoveredListingAttribution(
                    listing_id=listing.id,
                    source_id=source.id,
                    source_listing_key=digest[:16],
                    source_url=f"https://boards.example.com/{provider}/{digest[:12]}",
                    retrieved_at=now,
                )
            )

        known = {
            item.content.get("name")
            for item in db.query(EvidenceItem).filter_by(user_id=user.id, kind="skill")
        }
        for skill in SKILLS:
            if skill in known:
                continue
            db.add(
                EvidenceItem(
                    user_id=user.id,
                    kind="skill",
                    content={"name": skill},
                    provenance="user-entered",
                    confirmation_state="confirmed",
                )
            )
        db.commit()
    finally:
        db.close()
    print("seeded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
