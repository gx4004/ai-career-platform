# Chapter 3 — Tool implementations

This chapter describes the six tools that compose the user-facing surface of the system: Resume Analyzer, Job Match, Career Path, Cover Letter, Interview Q&A, and Portfolio Planner. They divide naturally into three groups by the role they play in the candidate's workflow. The *primary* tools (Resume, Job Match) produce numerical assessments and can therefore be run in either the blended or the fully-heuristic mode introduced in Chapter 4. The *application* tools (Cover Letter, Interview Q&A) generate creative artefacts and are LLM-only by construction. The *planning* tools (Career Path, Portfolio Planner) sit between these two extremes; they consume the resume to produce structured forward-looking guidance whose quality depends primarily on the language model's reasoning over the heuristic prepass.

Before discussing each tool, Section 3.1 isolates the cross-cutting concerns that all six share, so that the per-tool sections can focus on what is specific to each.


## 3.1 Cross-cutting design

### 3.1.1 The structured-output LLM client

All LLM calls go through a single coroutine, `complete_structured(system_prompt, user_prompt, schema=None, model_override=None)`, defined in `app/services/ai_client.py`. The function lazily initialises the Vertex AI SDK once per process, dispatches the request to the configured provider (`vertex` in production), requests JSON output, and returns a parsed Python dictionary.

Two reliability mechanisms are built into the client. **Per-call timeout** bounds an individual generation at 120 seconds; this is well above the 95th-percentile latency observed in practice but short enough that a stuck request does not tie up a worker indefinitely. **Exponential backoff with jitter** retries up to four times (at 5, 10, 20, and 40 seconds, plus a small random offset) for transient errors (`TimeoutError`, `RuntimeError`, `json.JSONDecodeError`). JSON-decode errors are retried because Gemini occasionally truncates structured output under load; the retry loop deliberately excludes `ValueError`, which is reserved for unrecoverable configuration errors that do not benefit from retrying. After the final retry exhausts, the exception propagates upward, where each tool service decides how to handle it according to the policy described in Section 3.1.4.

The 5, 10, 20, and 40 second retry schedule was selected after early testing; a shorter 2–4–8–16 schedule often retried before the upstream transient error had cleared.

### 3.1.2 The locked-payload prompt pattern

For the analytical tools (Resume Analyzer, Job Match) the prompt builder constructs three blocks: a *system* prompt that establishes role, register, and forbidden behaviours; a *user* prompt that contains the resume and (where applicable) the job description; and a *locked-payload* block that contains the full output of the heuristic prepass. The locked payload includes the deterministic score breakdown, the detected sections, the matched and missing keywords, and the evidence list. The LLM is instructed to treat this block as authoritative ground truth. The backend then recomputes the final score from the deterministic prepass and the returned LLM score breakdown, so the deployed response does not rely on the model to preserve arithmetic correctly.

### 3.1.3 Pydantic-validated structured output

Every API response returned from a tool router is validated against a Pydantic response model in `app/schemas/tools.py`. The frontend mirrors those response contracts with Zod schemas in `frontend/src/lib/api/schemas.ts` and validates responses before rendering. The two schema files are kept aligned by tests and code review rather than by code generation, which is adequate for the small number of response shapes in this project. Gemini itself is asked for JSON output, but the backend treats the model response as untrusted: service-level normalisation fills missing fields, drops invalid enum values, and falls back to deterministic heuristic content when the analytical LLM call fails.

### 3.1.4 Fallback policy

The system distinguishes two failure modes for an LLM call: a recoverable failure that should produce a degraded but useful response, and an unrecoverable failure that should surface as an explicit error to the user.

For *analytical* tools (Resume Analyzer, Job Match) the recoverable path is taken: when `complete_structured` raises after exhausting retries, the service constructs a complete response from the heuristic prepass alone, using the same payload structure the LLM would have populated but with the deterministic baseline as the source of truth. The user sees the result and a `confidence_note` indicating that the analysis ran in heuristic-only mode. This design satisfies non-functional requirement N3 of Chapter 2.

This fallback path was not added defensively at the design stage; it was added after intermittent transient failures during early testing produced the system's first user-visible 500-class error. Once the heuristic fallback was wired up, the same code path made the comparative study described in Chapter 4 trivial to implement: the fully-heuristic mode is, mechanically, the fallback path triggered unconditionally rather than only on failure, and the runtime mode toggle of Section 4.2.9 is the smallest possible UI surface on top of that mechanism.

For *generative* tools (Cover Letter, Interview Q&A, Career Path, Portfolio) no fallback is offered. A heuristic-generated cover letter or interview-question list is not a credible substitute for an LLM-generated one; producing such an artefact would be misleading. These tools raise a structured 503 error that the frontend renders as a retry-able failure state.

### 3.1.5 Caching

The shared pipeline (Chapter 2.3.2) computes a content hash from the tool name, the sanitised inputs, the user identifier, and any tool-specific cache keys. The result of a cache hit is returned without invoking the service function, bypassing the LLM call entirely. The cache is in-memory with a one-hour TTL and is intentionally not shared between processes; this is acceptable for thesis-scoped traffic, and Section 5.3 documents the Redis-backed shared cache as the planned operational upgrade.


## 3.2 Resume Analyzer

The Resume Analyzer accepts a resume text and an optional target job description, and returns a five-axis quality assessment. It is the most heavily exercised tool in the system; every other tool can be invoked from the result page of the Resume Analyzer with the analysed resume already loaded.

### 3.2.1 Input contract

The request body contains the raw resume text (free-form, minimum 50 characters), an optional job description text, and an optional `feedback` string used when the user regenerates with a specific instruction.

### 3.2.2 Heuristic prepass

`build_resume_prepass(resume_text, job_description)` performs five extractions in a single pass over the resume text.

1. **Section detection.** A regular-expression pass identifies common resume section headers (`Summary`, `Experience`, `Skills`, `Education`, `Projects`, `Certifications`) and returns the set of sections present.
2. **Keyword extraction.** When a job description is supplied, role-relevant keywords are extracted from the job description and matched against the resume. The result is a pair of lists: matched keywords and missing keywords. Chapter 4 introduces the strong-heuristic v2 of this extraction, which replaces the binary match/miss with a TF–IDF weighted overlap and a fuzzy-matching layer to accept minor surface variation.
3. **Quantification detection.** Bullet lines are scanned for numbers, percentages, currency tokens, and time periods that indicate measurable outcomes. The count of quantified bullets is one of the inputs to the *impact* sub-score.
4. **Skill extraction.** A curated list of skill phrases is searched against the resume; detected skills are returned as a list. Chapter 4 expands this stage to a top-down lookup against a bundled subset of the ESCO taxonomy [8, 9, 12].
5. **Structural metrics.** The total bullet count, the word count, and the number of detected sections are returned as inputs to the *structure*, *clarity*, and *completeness* sub-scores.

The five-axis score breakdown (keyword alignment, impact, structure, clarity, and completeness) is computed from these extractions through `compute_resume_breakdown` in `app/services/quality_signals.py`. Each sub-score is clamped to the integer range \[0, 100].

### 3.2.3 Prompt and post-processing

The resume prompt (`app/prompts/resume.py`) instructs the LLM to act as a senior career coach producing a structured assessment. The locked payload includes the score breakdown and the evidence dictionary. The LLM is asked to populate four narrative fields (a one-line headline, a verdict, a confidence note, and a list of strengths), to expand the deterministic issue list into prose with `why_it_matters`, `evidence`, and `fix` fields, and to produce up to three prioritised top actions that may be different in framing from the issues. When the user has specified a target role label in the job description, the LLM additionally produces a `role_fit` block with a fit score and a rationale.

The service then computes the blended score (heuristic 40%, LLM 60%) following the formula in Section 4.2 and returns a unified response object. When the heuristic and LLM overall scores diverge beyond the configured confidence-gap threshold (18 points for v2, 20 points for v1), an explicit `confidence_note` is added to the response surface so that the user understands that two estimates disagreed.


## 3.3 Job Match

The Job Match tool accepts a resume and a job description (provided as text or as a URL) and produces a structured match assessment.

### 3.3.1 Input contract

The job description input may be a URL pointing to a public job posting. When a URL is supplied, the backend attempts to scrape the description through a layered strategy: a primary BeautifulSoup pass for static markup, a Playwright fallback for JavaScript-heavy posting boards, and a graceful paste prompt presented to the user when both attempts fail. The scraped text is then treated identically to a pasted text input.

### 3.3.2 Heuristic prepass

The Job Match prepass extends the Resume Analyzer prepass with a single additional output: a deterministic match score computed from the matched-keyword and missing-keyword lists through `compute_match_score` in `app/services/quality_signals.py`. The function returns a value in \[0, 100] derived from the matched-to-total ratio. The deterministic verdict (`strong`, `borderline`, `stretch`) is read off this score by `job_match_verdict`.

### 3.3.3 Prompt and post-processing

The Job Match prompt (`app/prompts/job_match.py`) instructs the LLM to produce a structured requirement-by-requirement breakdown. For each detected role requirement, the LLM populates an importance (`must` / `preferred`), a status (`matched` / `partial` / `missing`), a one-sentence resume-evidence statement, and a suggested fix. The locked payload supplies the matched and missing keyword lists; the LLM is asked to expand them into role-realistic phrasing rather than echoing back the raw tokens. The response also includes a recruiter-style summary and a list of tailoring actions ranked by expected impact.

Because the deterministic match score is computed outside the LLM response, the model cannot change the final score returned by the backend. This preserves comparability across regenerations and makes the fully-heuristic mode of Chapter 4 a substitution of the scoring path rather than a separate response contract.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```


## 3.4 Career Path

The Career Path tool produces forward-looking career suggestions from the resume alone. Unlike Resume Analyzer and Job Match, it does not consume a job description; the user instead optionally supplies a free-form preference string ("interested in management", "want to stay technical") that is folded into the prompt.

### 3.4.1 Heuristic prepass

The prepass extracts three coarse profile signals from the resume: an inferred *discipline* (backend-engineering, frontend-engineering, full-stack-engineering, data-analytics, product-design, etc., among ~10 supported categories), an inferred *seniority* (junior, mid, senior), and an estimated *years of experience*. Each inference is conservative; when confidence is low, the prepass returns the most general label.

For every discipline, a curated `DISCIPLINE_TARGET_SKILLS` mapping defined in `app/services/career_recommender.py` lists six aspirational skills typical of that discipline at the next seniority level. This mapping plays the role of a deterministic skills floor for the LLM's reasoning, similar to the locked payload in the analytical tools but lighter.

### 3.4.2 Prompt and post-processing

The career prompt instructs the LLM to produce three to five candidate paths, each with a path label, a one-paragraph rationale grounded in the resume, a list of aligned strengths, a list of skills to develop (with the discipline-target list available as a hint), and an indicative timeline expressed in seniority steps rather than calendar months. The output is intentionally not numerical; the comparative study in Chapter 4 does not include the planning tools.


## 3.5 Cover Letter

The Cover Letter tool produces a tailored cover letter from a resume and a job description. There is no heuristic prepass that would produce a letter, so this tool is LLM-only.

### 3.5.1 Prompt and post-processing

The prompt asks the LLM to write a letter in three explicit structural sections: an opening that names the role and the candidate's central value proposition, a middle paragraph that grounds two or three claims in resume evidence, and a closing that proposes a concrete next step. The LLM is instructed to write in a register that the user can adapt (neither overly formal nor casual) and to avoid clichés that recruiters report fatigue with (the prompt includes an explicit blocklist of phrases such as "team player", "synergy", and "passionate self-starter"). The response also includes three short alternative opening lines, allowing the user to swap the opening without regenerating the whole letter.


## 3.6 Interview Q&A

The Interview Q&A tool produces a curated list of likely interview questions for a given resume and job description. It is LLM-only.

### 3.6.1 Prompt and post-processing

The prompt asks the LLM to cluster the generated questions into three categories (*behavioural*, *technical*, and *role-specific*) with a target of five to seven questions per category. Each question carries a one-sentence coaching note that names the underlying competency the interviewer is probing for and suggests the kind of evidence the candidate should be ready to recall.

A practice mode is available as a follow-up flow: the user picks a question from the generated list and supplies a written practice answer. The system then sends the question, the candidate's answer, and the resume to Gemini and may override the default model through `LLM_PRACTICE_MODEL`. This is the only place in the system where a model override is wired, because practice feedback can be invoked repeatedly during a single user session.


## 3.7 Portfolio Planner

The Portfolio Planner tool produces a prioritised list of artefact ideas and skill gaps for a given resume and target role. The output is forward-looking and structural rather than evaluative.

### 3.7.1 Prompt and post-processing

The prepass detects the resume's discipline and seniority (the same inference used by Career Path) and identifies up to ten skills that the resume *does not* currently support but that the target role requires. The prompt then asks the LLM to produce three to five concrete artefact ideas, each with a working title, a brief description, the skills it would demonstrate, an estimated effort tier (small / medium / large), and a suggested presentation format (GitHub repository, case study, demo video, written post). The response also returns a sequenced plan that orders the artefacts by expected return on effort.


## 3.8 Persistence, regeneration, and result history

Every tool result that runs in *authenticated* mode is persisted as a `ToolRun` row through the shared pipeline (Chapter 2.3.2). The persistence layer adds three behaviours that are visible to the user.

**Result pages by history identifier.** The result of a tool run is rendered at `/<tool>_/result/<historyId>`, where the history identifier is the primary key of the `ToolRun` row. The user can return to a result page later by visiting the URL directly, share the URL with a collaborator who has access to the same account, or reach the result through the *History* page that lists every run in reverse-chronological order.

**Regeneration as a parent–child chain.** When the user regenerates a result with feedback, a new `ToolRun` row is written whose `parent_run_id` points to the original. The history page renders this as a chain rather than as two unrelated entries, making it possible to walk back through earlier iterations of a single piece of analytical work.

**Cross-tool linkage.** A tool may consume the result of a previous tool as part of its input. For example, the Cover Letter can be invoked with the Job Match result already in hand. The pipeline records the linked run identifiers on the new tool run, producing a graph of dependencies that supports the workflow-level reasoning that the user research informed.


## 3.9 Reliability behaviour observed in production

In production traffic during the development period, the analytical tools (Resume Analyzer, Job Match) exhibited a heuristic-only fallback rate below one percent of all calls; the LLM-call retry policy (Section 3.1.1) absorbed nearly all transient failures. The generative tools (Cover Letter, Interview Q&A, Career Path, Portfolio) showed a slightly higher hard-error rate because they cannot fall back; the user-visible failure mode is a structured retry prompt rather than a fabricated artefact.

Among the six tools, the one that took the longest to stabilise was the Interview Q&A practice mode. The first version invoked the same Gemini model used by the rest of the system; the per-session cost ran high enough during heavy practice usage that the cheaper-model fallback path described in Section 3.6.1 was introduced (the `LLM_PRACTICE_MODEL` configuration is the result of that work). The Cover Letter tool produced the opposite kind of surprise: the structural prompt with the explicit blocklist of clichés produced usable letters on the first end-to-end iteration and required only minor adjustments after a small number of dogfooding runs.

The blended scoring path (heuristic 40%, LLM 60%) and the heuristic-only fallback are exercised by the same code in the analytical services. The fully-heuristic mode introduced in Chapter 4 reuses the same fallback path and adds an administrative toggle that bypasses the LLM call unconditionally. This is the smallest possible change that satisfies non-functional requirement N7 from Chapter 2: runtime switchability between the two scoring modes for the comparative study reported next.
