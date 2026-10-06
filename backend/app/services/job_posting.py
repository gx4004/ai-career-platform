"""The job title and hiring company a pasted posting names, read without a model.

Shared by Job Match (its heuristic ``job_title``/``company``) and the fake provider, so
a local run and a real one name the same job.
"""

from __future__ import annotations

import re

# "Senior Backend Engineer, Platform at Northwind Labs (Berlin, hybrid)." -> title, company:
# a trailing parenthetical (location, work mode) and a closing full stop are not the company,
# nor is the ", Berlin" after "at Contoso".
_JOB_HEADER_RE = re.compile(
    r"^(?:job\s+title\s*[:\-]\s*)?(?P<title>[^|@\n]{3,80}?)\s+(?P<sep>at|@|\|)\s+"
    r"(?P<company>[A-Z0-9][^|\n,.;()]{1,50}?)(?:\s*,\s*(?P<place>[^|\n,.;()]{1,40}))?"
    r"\s*(?:\([^()\n]{0,80}\))?\s*[.!]?$"
)
# "Data Engineer | Remote", "... | Full-time", "... @ Berlin HQ": after "|" or "@" a header
# often names where or how the job is worked, not who hires.
_NOT_EMPLOYER = re.compile(
    r"^(?:remote|hybrid|on-?site|in[- ]office|full[- ]?time|part[- ]?time|contract(?:or)?|freelance"
    r"|temporary|permanent|internship|intern|anywhere|worldwide)\b"
    r"|\b(?:hq|headquarters|office|campus|remote)$",
    re.I,
)

_COMPANY_NAME = r"(?P<company>[A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,2})"
_COMPANY_PATTERNS = (
    re.compile(r"^\s*About\s+" + _COMPANY_NAME + r"\s*:?\s*$", re.M),  # an "About Contoso" heading
    re.compile(r"^\s*" + _COMPANY_NAME + r"\s+is\s+(?:hiring|looking|seeking|growing)\b", re.M),
    # "... who have worked at Google": an "at" after a word about past work names a former employer.
    re.compile(
        r"\b(?:hiring|seeking|looking for|join)\b"
        r"(?:(?!\b(?:worked|working|work|experience|experienced|background|previously|formerly)\b)[^.\n]){0,80}?"
        r"\bat\s+" + _COMPANY_NAME
    ),
)
_NOT_COMPANY = frozenset({"the", "us", "you", "our", "this", "we", "role", "team", "company", "position", "job"})


def company_from_prose(job_description: str) -> str:
    """The employer from "About Contoso", "Contoso is hiring" or "... hiring ... at Contoso"."""
    for pattern in _COMPANY_PATTERNS:
        for match in pattern.finditer(job_description):
            company = match.group("company").strip()
            if company.split()[0].lower() not in _NOT_COMPANY:
                return company[:60]
    return ""


def posting_header(job_description: str) -> tuple[str, str]:
    """(title, company) from the posting's header or its prose, when it names them; "" when not."""
    company = ""
    field_match = re.search(r"^\s*(?:company|employer|organi[sz]ation)\s*:\s*(.+)$", job_description, re.M | re.I)
    if field_match:
        company = field_match.group(1).strip()[:60]
    for line in job_description.splitlines():
        line = line.strip()
        if not line:
            continue
        match = _JOB_HEADER_RE.match(line) if len(line) <= 120 else None
        if match:
            named = match.group("company").strip()
            if _NOT_EMPLOYER.search(named) or (match.group("place") and match.group("sep") != "at"):
                named = ""  # "| Remote", or "| Berlin, Germany": a place, not an employer
            return match.group("title").strip(), company or named or company_from_prose(job_description)
        break
    return "", company or company_from_prose(job_description)
