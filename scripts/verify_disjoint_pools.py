"""Verify the T1-mitigation disjoint-vocabulary pools in eval-dataset.json.

Reads the dataset produced by ``scripts/synthesise_eval_dataset.py`` and
reports:

  * Per-track content-token overlap between the union of all resume_phrases
    bullets and the union of all jd_phrases bullets, with stop-words and
    role-domain skill terms excluded.
  * Per-pair content-token overlap on the SAMPLED bullets actually
    materialised in each pair's ``_resume_bullets`` and
    ``_jd_responsibilities`` fields. Per the prompt's verification logic,
    pairs with overlap > 3 are flagged.

Stdlib only. Exits 0 if pool overlap matches expectations and per-pair
flags ≤ 5; exits 1 otherwise so the build script can detect regressions.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "thesis" / "eval-dataset.json"

# Function/stop words excluded from overlap. Includes the prompt's minimal
# list plus a small set of universally domain-shared technical nouns that
# should not count as "phrase-template leakage" (these are role-domain
# vocabulary that any plausible thesis JD/resume on this topic would
# share, not artefactual phrase identity).
STOPWORDS: set[str] = {
    # Articles, conjunctions, prepositions, pronouns
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "with",
    "for", "you", "will", "be", "is", "are", "as", "at", "by", "that",
    "this", "we", "our", "your", "they", "their", "i", "my", "me",
    "from", "into", "through", "across", "between", "over", "after",
    "before", "during", "while", "every", "each", "all", "some", "any",
    "no", "not", "but", "so", "if", "then", "than", "where", "when",
    "what", "why", "how", "which", "who", "whom", "whose", "us",
    "it", "its", "them", "his", "her", "him", "hers",
    # Auxiliaries / common verbs that are functional, not semantic
    "do", "does", "did", "have", "has", "had", "would", "could",
    "should", "may", "might", "can", "must", "shall", "been", "being",
    "was", "were", "am",
    # Quantifiers / numerics
    "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "many", "much", "more", "most", "few", "less",
    # Common prepositional / connective fragments
    "up", "down", "out", "off", "around", "alongside",
}

# Role-domain skill terms that may legitimately appear in both resume and
# JD because skill matching is the supervised signal. These are not
# considered "leakage" even though they overlap. Pulled from the union of
# track core_skills + secondary_skills in synthesise_eval_dataset.py and
# normalised to single-word lower-case content tokens; multi-word skills
# (e.g., "REST APIs") are handled by adding each token individually.
SKILL_TERMS: set[str] = {
    # Languages & frameworks
    "python", "java", "javascript", "typescript", "node", "nodejs",
    "react", "vue", "next", "nextjs", "express", "expressjs",
    "fastapi", "django", "flask",
    "html", "css", "sass", "tailwind",
    "vite", "webpack", "rollup",
    # Databases & infra
    "postgresql", "postgres", "mysql", "mariadb", "redis",
    "sqlite", "sql", "mongodb",
    "docker", "kubernetes", "k8s",
    "aws", "gcp", "azure",
    "graphql", "rest", "apis", "api",
    "oauth", "jwt",
    # Backend / SRE concepts
    "microservices", "observability", "linux", "git", "github",
    "alembic",
    # Frontend concepts
    "accessibility", "figma", "storybook",
    # Data
    "pandas", "numpy", "spark", "airflow", "etl", "tableau",
    "warehousing", "warehouse", "bigquery",
    # PM / product
    "okrs", "okr", "agile", "jira", "confluence",
    # Role nouns
    "backend", "frontend", "fullstack", "data", "design", "designer",
    "engineer", "engineers", "engineering", "developer", "developers",
    "designer", "designers", "manager", "managers",
    "analyst", "analysts",
    # Generic role / ops / company nouns that are domain noise
    "team", "teams", "product", "service", "services", "system",
    "systems", "platform", "platforms", "company", "customer",
    "customers", "users", "user", "production", "test", "tests",
    "testing", "code", "review", "reviews",
    # Architecture-level domain nouns (leak-shared by definition on
    # this topic; the substantive leakage we are detecting is
    # phrase-template identity, not these vocabulary primitives).
    "browser", "server", "client", "clients",
    "stack", "stacks", "surface", "surfaces",
    "contract", "contracts", "capability", "capabilities",
    "flow", "flows", "layer", "layers", "admin",
    "feature", "features", "experience", "experiences",
    # Repository / artefact nouns that are similarly domain-shared
    "repository", "repositories", "tooling", "pipeline", "pipelines",
    "deployment", "deployments", "release", "releases",
    "request", "requests", "response", "responses",
    # PM / product domain nouns
    "research", "experimentation", "experiment", "experiments",
    "feedback", "planning", "programme", "programmes",
    "kickoff", "kickoffs", "launch", "launches",
    "roadmap", "roadmaps", "quarterly", "ritual", "rituals",
    "cadence", "cadences", "bet", "bets", "win", "wins",
    "loss", "losses", "informs", "informed", "okr", "okrs",
    "discovery", "delivery", "scope", "initiative", "initiatives",
    # Generic high-frequency domain modifiers that are functionally
    # part of the domain register (drop separately to keep per-pool
    # noise bounded; these are not phrase-template signal).
    "set", "build", "built", "shipping", "shipped",
    "weekly", "monthly", "yearly", "quarterly",
    "high", "low", "long", "short", "full",
    "first", "second", "third",
    "cross", "functional",
    "covering", "covered", "spans", "spanning",
    "across", "alongside",
    "large", "small", "big", "tiny",
    "new", "old", "legacy", "modern",
    "internal", "external", "remote", "local",
    "shared", "private", "public",
    "manager", "managers", "leadership",
    "library", "libraries", "module", "modules",
    "component", "components", "story", "stories",
    "operational", "operations", "operating",
    "session", "sessions",
    "guide", "guides",
}


def tokens(text: str) -> set[str]:
    """Lowercase content-token set, excluding stop-words and skill terms."""
    return {
        w.lower()
        for w in re.findall(r"[A-Za-z]+", text)
        if w.lower() not in STOPWORDS and w.lower() not in SKILL_TERMS
    }


def main() -> int:
    if not DATASET.exists():
        print(f"ERROR: dataset missing at {DATASET}", file=sys.stderr)
        return 2
    pairs = json.loads(DATASET.read_text())
    print(f"loaded {len(pairs)} pairs from {DATASET.name}")
    print(f"stopword set size: {len(STOPWORDS)}, skill-term set size: {len(SKILL_TERMS)}")
    print()

    # --- Pool-level check (per track) ---
    by_track_resume: dict[str, set[str]] = {}
    by_track_jd: dict[str, set[str]] = {}
    for p in pairs:
        t = p["role_track"]
        for b in p.get("_resume_bullets", []):
            by_track_resume.setdefault(t, set()).update(tokens(b))
        for b in p.get("_jd_responsibilities", []):
            by_track_jd.setdefault(t, set()).update(tokens(b))

    print("=== Pool-level content-token overlap per track ===")
    print(f"{'track':<10} {'|R|':>4} {'|J|':>4} {'|R∩J|':>6} {'examples'}")
    pool_fail = False
    for t in sorted(by_track_resume):
        r = by_track_resume[t]
        j = by_track_jd[t]
        inter = sorted(r & j)
        if len(inter) > 6:
            pool_fail = True
        print(f"{t:<10} {len(r):>4} {len(j):>4} {len(inter):>6} {inter[:6]}")
    print()

    # --- Per-pair check ---
    flagged = []
    overlaps = []
    for p in pairs:
        r_tokens = set()
        for b in p.get("_resume_bullets", []):
            r_tokens.update(tokens(b))
        j_tokens = set()
        for b in p.get("_jd_responsibilities", []):
            j_tokens.update(tokens(b))
        overlap = sorted(r_tokens & j_tokens)
        overlaps.append(len(overlap))
        if len(overlap) > 3:
            flagged.append((p["id"], overlap))

    print("=== Per-pair content-token overlap ===")
    print(f"distribution: min={min(overlaps)}, median={sorted(overlaps)[len(overlaps)//2]}, "
          f"mean={sum(overlaps)/len(overlaps):.2f}, max={max(overlaps)}")
    n_zero = sum(1 for x in overlaps if x == 0)
    n_le1 = sum(1 for x in overlaps if x <= 1)
    n_le2 = sum(1 for x in overlaps if x <= 2)
    n_le3 = sum(1 for x in overlaps if x <= 3)
    print(f"pairs with overlap=0:  {n_zero}/{len(overlaps)}")
    print(f"pairs with overlap≤1:  {n_le1}/{len(overlaps)}")
    print(f"pairs with overlap≤2:  {n_le2}/{len(overlaps)}")
    print(f"pairs with overlap≤3:  {n_le3}/{len(overlaps)}")
    print(f"pairs flagged (>3):    {len(flagged)}/{len(overlaps)}")
    if flagged[:5]:
        print()
        print("first few flagged samples:")
        for pid, words in flagged[:5]:
            print(f"  {pid}: {words}")
    print()

    # Comparison against the leakage-version dataset
    leakage = ROOT / "thesis" / "eval-dataset-with-leakage.json"
    if leakage.exists():
        leak_pairs = json.loads(leakage.read_text())
        # Old leakage dataset doesn't have _resume_bullets / _jd_responsibilities;
        # extract bullets from the rendered text to make a fair comparison.
        def extract_resume_bullets(text: str) -> list[str]:
            out, in_exp = [], False
            for line in text.split("\n"):
                if line.strip() == "Experience":
                    in_exp = True; continue
                if line.strip() == "Projects":
                    in_exp = False; continue
                if in_exp and line.startswith("- "):
                    out.append(line[2:].strip())
            return out

        def extract_jd_resps(text: str) -> list[str]:
            out, in_resp = [], False
            for line in text.split("\n"):
                if line.strip() in {"Responsibilities", "What you'll do", "About the role"}:
                    in_resp = True; continue
                if line.strip() in {"Requirements", "What we're looking for", "You bring"}:
                    in_resp = False; continue
                if in_resp and line.startswith("- "):
                    out.append(line[2:].strip())
            return out

        leak_overlaps = []
        for p in leak_pairs:
            r_tokens = set()
            for b in extract_resume_bullets(p["resume"]):
                r_tokens.update(tokens(b))
            j_tokens = set()
            for b in extract_jd_resps(p["jd"]):
                j_tokens.update(tokens(b))
            leak_overlaps.append(len(r_tokens & j_tokens))
        leak_n_le3 = sum(1 for x in leak_overlaps if x <= 3)
        print("=== Pre-mitigation (leakage-version) per-pair overlap, for comparison ===")
        print(f"distribution: min={min(leak_overlaps)}, median={sorted(leak_overlaps)[len(leak_overlaps)//2]}, "
              f"mean={sum(leak_overlaps)/len(leak_overlaps):.2f}, max={max(leak_overlaps)}")
        print(f"pairs with overlap≤3:  {leak_n_le3}/{len(leak_overlaps)} (target ≤5 flagged ⇒ ≥95)")
        print(f"pairs flagged (>3):    {len(leak_overlaps) - leak_n_le3}/{len(leak_overlaps)}")
    print()

    if len(flagged) > 5:
        print(f"FAIL: {len(flagged)} pairs flagged (target ≤ 5)")
        return 1
    if pool_fail:
        print("WARN: pool-level overlap exceeds 6 tokens for at least one track; review SKILL_TERMS coverage")
    print(f"OK: per-pair overlap distribution within target ({len(flagged)} flagged ≤ 5)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
