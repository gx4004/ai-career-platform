# Chapter 1 — Introduction

Choosing a career path has become substantially harder over the last decade. The labour market changes faster than any individual can track manually: new job titles appear, established roles fragment into specialisations, and the skills that employers list on a job advertisement now turn over on the order of years rather than decades [3]. At the same time, the number of resumes a hiring team sees per opening has grown, and most large employers route applications through automated screening systems before any human reviewer touches the document [18]. The candidate sits between these two pressures: they need to understand which roles fit their evolving experience, and they need to present that experience in a form that survives algorithmic filtering before it reaches a recruiter.

A working candidate trying to answer those questions today typically uses a fragmented set of tools: a generic resume builder, a job board's "match score", a separate cover-letter writing prompt, an interview-preparation list curated by hand. Each of those tools sees only a slice of the candidate. None of them carry context across the workflow. The thesis presented here builds a single, integrated AI-based system that collapses that workflow into one workspace, and uses the candidate's resume as the shared substrate across every tool in the system.

The immediate motivation for the topic of this thesis was the author's experience as an international student at Wrocław University of Science and Technology. During an internship search the author used three or four of the fragmented career tools described above (a generic resume editor, a job-board match score, a separate cover-letter prompt, an interview-question generator), and the friction that emerged was not in any single tool's output but in the manual re-entry of the same resume into each one. Every tool started from zero context and none of them passed information forward to the next stage of the workflow. The thesis project began as an attempt to remove that friction and, over the months of implementation, grew into the integrated AI-augmented decision-support system [1, 2] that this thesis describes.


## 1.1 The career decision problem

Career decision making combines three sub-problems. *Self-assessment* asks the candidate to describe skills, experience, and preferences in a machine-readable form. *Market alignment* asks how that profile compares with job descriptions. *Action planning* asks which changes, projects, or interview stories would improve the candidate's position.

These problems have usually been studied separately. Career-counselling research treats self-assessment as a structured guidance problem [15]. Information-retrieval research treats market alignment as ranking over job postings [13, 21]. Decision-support research frames action planning as a recommendation task under uncertainty [1, 2]. The practical gap is the absence of a single system in which all three stages share one candidate representation.

The integrated representation matters because one fact can support several decisions. A quantified backend-project bullet may raise the resume quality score, improve fit against a backend job description, justify a stronger cover-letter paragraph, and supply a story for a behavioural interview answer. If the tools are separated, the user must manually preserve and reinterpret that fact; if they share a representation, the system can carry it forward.


## 1.2 AI-based recommendation systems for careers

Classical recommender systems rely on many users repeatedly interacting with dense item catalogues. Career recommendation is different: job titles are sparse, employer labels are inconsistent, resume evidence is unstructured, and a single user produces few explicit preference signals. Recent career systems therefore treat the task less as collaborative filtering and more as structured matching between a resume and a job description projected into a shared representation [6, 8, 9, 10, 11, 12, 13].

CareerRec [15], for example, applies tree-based classifiers to 2,255 information-technology employee records and reports about 70% accuracy on career-path classification — a different task framing (single-label classification over a closed catalogue) and data surface (real IT-employee records) than the resume-to-job-description scoring problem evaluated in Chapter 4, which is why a head-to-head comparison is not pursued in the present thesis. Broader AI decision-support work [1, 2] shows the same movement from manually engineered features toward learned representations. These systems help select or rank career options, but they usually stop before the candidate has to act on the recommendation. The present thesis extends that workflow by combining assessment, job matching, cover-letter support, interview preparation, and portfolio planning in one application.

This extension is intentionally engineering-oriented. The thesis is not only an offline modelling exercise. It asks whether recommendation logic can be embedded in a deployed workflow where a candidate uploads a resume, receives structured feedback, follows the result into another tool, and later returns to earlier runs through persistent history.


## 1.3 Resume parsing and job-description analysis

Resume matching starts with structure extraction from free-form text. Early resume parsers used regular expressions and section-header dictionaries to identify names, dates, education, experience, and skills [14]. Such parsers are brittle against unusual formatting but remain valuable as deterministic, inspectable baselines.

Modern parsers rely more heavily on natural-language processing. Named-entity-recognition models extract organisations, dates, and skills; transformer models improve contextual interpretation of ambiguous phrases [4]. Resume2Vec [18] reports a 15.85% improvement in normalised discounted cumulative gain over a non-contextual ATS baseline by using resume embeddings.

Job-description analysis is the demand-side counterpart. Recent work links job postings to standardised taxonomies such as ESCO, the European multilingual classification [8], and O*NET. This normalisation lets "JavaScript", "JS", and "ECMAScript" resolve to the same skill. The literature includes top-down ESCO matching and model-based approaches such as JobBERT, ESCOXLM-R, and LLM-assisted skill extraction [9, 10, 11, 12, 13]. The system implemented here adopts a top-down strategy: a curated ESCO subset is bundled with the application and used to normalise skills on both sides of the match.


## 1.4 Heuristic and language-model scoring approaches

The central design tension addressed by this thesis is the choice between two families of methods for scoring the alignment between a resume and a job description.

The first family is *heuristic*: classical information-retrieval techniques that rely on statistical regularities of text. The foundational methods in this family, *TF–IDF* [5] and *BM25* [6], weight individual terms by how distinctive they are within a corpus, so that a rare technical skill counts for more than a common word. Fuzzy-matching algorithms based on the *Levenshtein edit distance* [7] absorb minor surface variation, allowing "Postgres" and "PostgreSQL" to register as the same term. Skill-taxonomy lookups against ESCO or O*NET [8, 9] provide the normalisation step described in the previous section. Section-weighted feature extraction recognises that a skill listed in a dedicated *Skills* section carries different meaning from the same skill mentioned in passing within a project description [18]. Together, these techniques form a scoring pipeline whose every step is inspectable, deterministic, and free of any external service dependency. The cost per analysis is dominated by string operations that take milliseconds on commodity hardware. The defendable claim, supported by decades of information-retrieval research, is that these techniques *already* capture most of what a recruiter scans for during the first pass over a resume.

The second family is *language-model*: large-language-model (LLM) services that read the resume and the job description as natural language, reason over them, and emit structured output describing the alignment. Recent research [16, 17] demonstrates that LLM-based agents reduce the time-to-decision in resume screening relative to manual review and produce qualitatively richer feedback than keyword-overlap baselines; a complementary semantic-modeling and feedback-loop architecture for resume enhancement is reported in [19]. Resume2Vec [18] documents the same effect on a ranking task. The cost of these methods is a per-call charge to a third-party API, latency on the order of one to several seconds per analysis, and an opaque reasoning process that is difficult to audit.

This dichotomy is the foundation of the comparative study reported in Chapter 4. The system described in this thesis exposes both modes through a single user-facing interface; an administrator can switch the analytical core between *fully heuristic* and *blended* (heuristic plus language model, weighted) at runtime, and the same input is then scored by both methods on demand. The research question is not whether one approach is universally better (both have well-understood failure modes) but rather: *under a controlled within-set characterisation on a synthetic, deterministically generated benchmark of resumes and job descriptions, how much of the discriminative power of the blended mode is recoverable from a strictly classical-IR heuristic, and at what cost ratio?* The deliberately within-set framing is important; the benchmark and its construction limits are documented in Section 4.1.4.

The order in which the two modes were built deserves explicit mention. The implementation began with the blended mode as the primary path; the comparative study was added to the scope later, after the supervisor proposed the heuristic-only mode as a research dimension that would balance the engineering and research aspects of the thesis. The strong heuristic that Chapter 4 describes was designed *after* the blended pipeline already existed; this sequencing shaped the heuristic toward the specific decisions the language model was already making in production rather than toward an idealised retrieval-research baseline, and Chapter 4 treats the resulting design coupling as a disclosed validity threat rather than a hidden one.

The value of the comparison is operational as well as scientific. If the heuristic preserves useful ranking behaviour, it can act as a low-cost fallback when the LLM is unavailable, as a live demonstration mode during the diploma defence, and as a high-volume preview path that does not accumulate per-call inference cost. If it fails, the system still benefits from the blended mode, but the fallback must then be framed only as an emergency response.

The dual-mode design followed from a more pragmatic motivation than would have been predicted at project start. The *retry-with-jitter* policy in the LLM client (described in Section 3.1.1, with delays at 5, 10, 20 and 40 seconds plus a small random offset) absorbs almost all transient failures, but during early development a small number of cascades occurred where consecutive retries still failed and the user-facing tool surfaced a generic error. Wiring up the heuristic *fallback policy* so that those cases produced a still-useful result accompanied by an explicit confidence note was a small change in code but a meaningful improvement in perceived reliability. Once that fallback path existed, the comparative study reported in Chapter 4 became a natural extension of it: if the deterministic mode is good enough to ship as a safety net, it deserves a measured comparison against the LLM-augmented mode it falls back from, rather than only being treated as an emergency path.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```


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
