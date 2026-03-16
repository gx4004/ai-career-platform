from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    auth,
    career,
    cover_letter,
    files,
    health,
    history,
    interview,
    job_match,
    job_posts,
    portfolio,
    resume,
    telemetry,
)
from app.services.observability import configure_logging

configure_logging()
app = FastAPI(title="Career Workbench API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

prefix = "/api/v1"

app.include_router(health.router, prefix=prefix)
app.include_router(auth.router, prefix=f"{prefix}/auth", tags=["auth"])
app.include_router(files.router, prefix=f"{prefix}/files", tags=["files"])
app.include_router(job_posts.router, prefix=f"{prefix}/job-posts", tags=["job-posts"])
app.include_router(resume.router, prefix=f"{prefix}/resume", tags=["resume"])
app.include_router(job_match.router, prefix=f"{prefix}/job-match", tags=["job-match"])
app.include_router(
    cover_letter.router, prefix=f"{prefix}/cover-letter", tags=["cover-letter"]
)
app.include_router(
    interview.router, prefix=f"{prefix}/interview", tags=["interview"]
)
app.include_router(career.router, prefix=f"{prefix}/career", tags=["career"])
app.include_router(
    portfolio.router, prefix=f"{prefix}/portfolio", tags=["portfolio"]
)
app.include_router(history.router, prefix=f"{prefix}/history", tags=["history"])
app.include_router(telemetry.router, prefix=f"{prefix}/telemetry", tags=["telemetry"])
