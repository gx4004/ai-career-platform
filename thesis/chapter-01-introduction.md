# Chapter 1 — Introduction

Choosing a career path has become harder as job titles fragment, skill requirements change quickly, and many applications pass through automated screening before a human reviewer sees them [3, 18]. Candidates therefore face two coupled problems: understanding which roles fit their current experience, and presenting that experience in a form that remains legible to both recruiters and algorithmic filters.

Most existing support is fragmented. A candidate may use one tool for resume editing, another for job-board matching, another for a cover letter, and another for interview preparation. Each tool starts from the same resume but rarely carries context into the next step. The thesis addresses this gap by building an integrated AI-based career-support system in which the resume is the shared representation used across all tools.

The immediate motivation was practical rather than abstract. During an internship search, the same resume had to be re-entered into a resume editor, a match-score tool, a cover-letter prompt, and an interview-question generator. The friction was not that any single tool was unusable; it was that each one forgot what the previous step had already established. The system developed for this thesis therefore treats continuity of candidate context as a first-class requirement.


## 1.1 The career decision problem

Career decision making combines three sub-problems. *Self-assessment* asks the candidate to describe skills, experience, and preferences in a machine-readable form. *Market alignment* asks how that profile compares with job descriptions. *Action planning* asks which changes, projects, or interview stories would improve the candidate's position.

These problems have usually been studied separately. Career-counselling research treats self-assessment as a structured guidance problem [15]. Information-retrieval research treats market alignment as ranking over job postings [13, 21]. Decision-support research frames action planning as a recommendation task under uncertainty [1, 2]. The practical gap is the absence of a single system in which all three stages share one candidate representation.

The integrated representation matters because one fact can support several decisions. A quantified backend-project bullet may raise the resume quality score, improve fit against a backend job description, justify a stronger cover-letter paragraph, and supply a story for a behavioural interview answer. If the tools are separated, the user must manually preserve and reinterpret that fact; if they share a representation, the system can carry it forward.


## 1.2 AI-based recommendation systems for careers

Classical recommender systems rely on many users repeatedly interacting with dense item catalogues. Career recommendation is different: job titles are sparse, employer labels are inconsistent, resume evidence is unstructured, and a single user produces few explicit preference signals. Recent career systems therefore treat the task less as collaborative filtering and more as structured matching between a resume and a job description projected into a shared representation [6, 8, 9, 10, 11, 12, 13].

CareerRec [15], for example, applies tree-based classifiers to 2,255 information-technology employee records and reports about 70% accuracy on career-path classification. Broader AI decision-support work [1, 2] shows the same movement from manually engineered features toward learned representations. These systems help select or rank career options, but they usually stop before the candidate has to act on the recommendation. The present thesis extends that workflow by combining assessment, job matching, cover-letter support, interview preparation, and portfolio planning in one application.

This extension is intentionally engineering-oriented. The thesis is not only an offline modelling exercise. It asks whether recommendation logic can be embedded in a deployed workflow where a candidate uploads a resume, receives structured feedback, follows the result into another tool, and later returns to earlier runs through persistent history.


## 1.3 Resume parsing and job-description analysis

Resume matching starts with structure extraction from free-form text. Early resume parsers used regular expressions and section-header dictionaries to identify names, dates, education, experience, and skills [14]. Such parsers are brittle against unusual formatting but remain valuable as deterministic, inspectable baselines.

Modern parsers rely more heavily on natural-language processing. Named-entity-recognition models extract organisations, dates, and skills; transformer models improve contextual interpretation of ambiguous phrases [4]. Resume2Vec [18] reports a 15.85% improvement in normalised discounted cumulative gain over a non-contextual ATS baseline by using resume embeddings.

Job-description analysis is the demand-side counterpart. Recent work links job postings to standardised taxonomies such as ESCO, the European multilingual classification [8], and O*NET. This normalisation lets "JavaScript", "JS", and "ECMAScript" resolve to the same skill. The literature includes top-down ESCO matching and model-based approaches such as JobBERT, ESCOXLM-R, and LLM-assisted skill extraction [9, 10, 11, 12, 13]. The system implemented here adopts a top-down strategy: a curated ESCO subset is bundled with the application and used to normalise skills on both sides of the match.


## 1.4 Heuristic and language-model scoring approaches

The thesis centres on a design tension between two scoring families. The first is *heuristic*: deterministic information-retrieval methods such as TF–IDF [5], BM25 [6], Levenshtein-style fuzzy matching [7], taxonomy lookup [8, 9], and section-weighted feature extraction [18]. These methods are cheap, auditable, and independent of external inference services. Their strongest claim is that they capture much of the first-pass recruiter signal: skill overlap, measurable impact, structure, and completeness.

The second family is *language-model*: LLM services that read a resume and a job description as natural language and return structured reasoning about alignment. Recent recruitment research reports faster screening and richer feedback from LLM agents and semantic feedback loops than from manual or keyword-only review [16, 17, 18, 19]. Their trade-off is per-call cost, higher latency, and a reasoning process that is harder to audit.

This dichotomy motivates the comparative study in Chapter 4. The implemented system exposes both modes through one interface: a *blended* mode that combines heuristic and LLM scores, and a *fully heuristic* mode that skips the LLM. The research question is deliberately bounded: on a controlled, deterministically generated synthetic benchmark of resumes and job descriptions, how much of the blended mode's discriminative power is recoverable from a strictly classical-IR heuristic, and at what latency and cost ratio? The benchmark limits are stated explicitly in Section 4.1.4.

The implementation order is also disclosed because it affects interpretation. The blended mode existed first; the strong heuristic was designed later after the supervisor proposed a heuristic-only comparison. This creates a post-hoc design-coupling threat that Chapter 4 treats as a validity limitation rather than hiding it.

The value of the comparison is operational. If the heuristic preserves useful ranking behaviour, it can act as a low-cost fallback when the LLM is unavailable and as a live demonstration mode during the diploma defence. If it fails, the system still benefits from the blended mode, but the fallback must be framed only as an emergency response.

The comparison also clarifies the boundary between engineering and research in the project. The engineering task is to deliver a reliable user-facing system. The research task is to characterise one design decision inside that system: whether a transparent scoring baseline remains useful when compared with the LLM-augmented path. The two tasks reinforce each other because the same runtime switch used for the study is also a practical operational control.


## 1.5 Purpose of the thesis

The objective of the thesis is to develop and evaluate a system that helps users choose suitable career paths based on their skills, experience, and current job-market context, generating personalised suggestions through a combination of classical information-retrieval methods and large-language-model inference.

The scope follows the application approved in the *Archive of Diploma Theses* on 3 February 2026 and has two aspects.

The **engineering aspect** is a deployed web application integrating six tools: Resume Analyzer, Job Match, Career Path, Cover Letter, Interview Q&A, and Portfolio Planner. The implementation uses a Python/FastAPI backend, a React/TanStack Start frontend, PostgreSQL persistence for users and tool-run history, Google Vertex AI Gemini 2.5 Flash for LLM inference, Railway deployment, and operational monitoring through Railway metrics and Sentry.

The **research aspect** is a controlled comparison of two scoring modes. The blended mode combines heuristic and LLM outputs with 40% / 60% weighting. The fully heuristic mode uses TF–IDF/BM25 keyword evidence, ESCO-aligned normalisation, fuzzy matching, section-weighted features, quantification detection, and action-verb scoring. Both modes are evaluated on a synthetic single-author benchmark of 100 resume/job-description pairs using score agreement, distribution shape, latency, and per-call cost.

The thesis does not claim that one mode is universally superior. Its design answer is to keep both modes available: the heuristic mode offers a deterministic fallback when LLM access is unavailable or insufficiently auditable, while the blended mode preserves richer prose and role-fit reasoning.

This dual-mode design also protects the system against two deployment constraints. Budget-limited environments may prefer a local deterministic path for high-volume screening, while audit-sensitive environments may require explanations traceable to fixed scoring rules. The blended path remains the default because it produces richer guidance, but the deterministic path gives the system a defendable degraded mode.

The thesis therefore evaluates the system at two levels. At the product level, success means that six career-support tools operate around one resume representation and persist their results in a coherent workflow. At the analytical level, success means that the score-comparison experiment is reproducible, that the heuristic baseline is specified clearly enough to audit, and that the reported limits prevent the result from being overgeneralised.


## 1.6 Structure of the thesis

Chapter 2 describes the system architecture: requirements, technology stack, backend layering, frontend routing and state, persistence, security, and Railway deployment.

Chapter 3 describes the six tools and the shared implementation patterns: `run_tool_pipeline`, prompt construction, structured-output validation, caching, retry behaviour, and heuristic fallback.

Chapter 4 presents the comparative study. It defines the synthetic dataset and controls, specifies the strong heuristic v2, reports agreement, distribution, latency, cost, and ablation results, and discusses limitations.

Chapter 5 concludes the thesis by summarising the engineering and empirical contributions, restating the limitations, and identifying future work: Polish-language ESCO support, a sentence-transformer intermediate tier [20, 21], and retrieval-augmented grounding for LLM outputs [25].

The bibliography lists the cited works. Appendix A provides representative source listings, Appendix B documents the synthetic dataset, Appendix C shows production screenshots, and Appendix D records the backend configuration reference.
