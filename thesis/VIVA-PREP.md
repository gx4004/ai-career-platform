# Defence rehearsal — likely committee questions

> **Document scope.** Internal preparation document; not part of the thesis
> body. Use for self-rehearsal, dry-run with friends/family, and the day
> before defence. Do **not** memorise verbatim — internalise the structure
> so the answers come naturally under stress.

Title: *An AI-Based System for Personalized Career Recommendation*
Author: Egemen Goncu · Supervisor: dr inż. Michał Błędowski
Faculty: Electronics, Photonics and Microsystems · WUST · Defence window 13–17 July 2026

---

## Top 3 viva risks (post-mitigation, Stage G)

These are the strongest attacks the committee can mount. Rehearse Q1–Q3
**aloud** at least three times each.

---

### Q1 — Vocabulary leakage in synthesis

> *"Your evaluation set was synthesised by a single script. Looking at
> the original construction, both the resume bullets and the JD
> 'What you'll do' bullets came from the same `track["responsibilities"]`
> pool — the same sentences appeared on both sides of the pair, which
> mechanically inflates keyword overlap and produces the headline
> r = 0.727. What did you do about that?"*

**Primary answer (≈ 90 sec):**

The leakage was identified during an adversarial review at the writing
stage and is documented in Section 4.1.4 as Threat T1. Before the APD
upload, the dataset was regenerated under a disjoint-vocabulary
construction. Each role track now exposes two separate phrase pools:
`resume_phrases`, written in past-tense achievement framing, and
`jd_phrases`, written in future-tense requirement framing. The two pools
are lexically disjoint at the content-word level: after stop-word and
role-domain skill terms are removed, the per-pair content-token overlap
distribution dropped from a mean of 11.82 in the leakage version to a
mean of 0.44 in the disjoint-pool version — roughly a 27× reduction. The
verification script `scripts/verify_disjoint_pools.py` reproduces this
check; the leakage-version dataset is archived at
`thesis/eval-dataset-with-leakage.json` for audit. The numbers reported
in Section 4.3 are the post-mitigation numbers; the pre-mitigation
numbers are reported alongside in Section 4.3.1' for an explicit
before/after comparison.

**Fallback if examiner pushes harder:**

If asked for the magnitude of the inflation: the post-mitigation Pearson
correlation is **0.836** against the pre-mitigation 0.727; the delta of
**+0.109** is — perhaps surprisingly — *positive*. The leakage version
had injected high-correlation noise specifically on the keyword axis but
introduced phrase-template artefacts on the structure and bullet-density
axes that depressed the structure-axis correlation (0.440 in the leakage
version, 0.830 post-mitigation). Removing the artefactual lexical
sharing without removing the legitimate skill-overlap signal that
classical keyword matching is supposed to detect therefore *raised*
the cross-mode agreement rather than lowering it. That is itself
empirical evidence of the threat the original construction exposed:
leakage was not just inflating one axis, it was distorting several at
once, and the disjoint-pool regeneration recovers a cleaner reading of
the cross-mode agreement.

---

### Q2 — Self-correlation in the headline number

> *"Your blended score is 0.4 × heuristic + 0.6 × LLM by construction
> (Section 3.2.3 says the heuristic is locked into the prompt as
> structured payload). When you correlate blended with heuristic-only,
> you are measuring a partial self-correlation. What is the LLM-only
> versus heuristic correlation, and why isn't that the headline number?"*

**Primary answer (≈ 90 sec):**

The committee has identified Threat T2, which is documented in
Section 4.1.4 and addressed in Section 4.3.1'. Because the heuristic
prepass is exposed to the LLM as a locked payload, the system computes
blended = 0.4 × heuristic + 0.6 × LLM-only with the heuristic component
held constant; that means LLM-only = (blended − 0.4 × heuristic) / 0.6
is recoverable post-hoc from the existing pair-level results without any
additional API calls. The Pearson correlation between LLM-only and
heuristic-only on the post-mitigation dataset is **0.627** with a 95%
cluster-bootstrap confidence interval of **[0.476, 0.765]** —
substantially lower than the headline post-mitigation *r* of 0.836,
because that headline contains the structural floor of agreement
attributable to the shared 0.40 heuristic component. The honest reading
is that the *cross-mode* agreement, after isolating the structural
component, is moderate-to-useful rather than strong; the blended-mode
advantage on prose-quality evidence (the clarity sub-score, *r* = 0.395
on the post-mitigation set) is what motivates keeping the LLM in the
pipeline, not the aggregate score. The pairwise *r*(blended, LLM-only)
is high by construction at **0.952** [0.923, 0.973], which is the
sanity check expected from the formula since blended is 60% LLM-only by
construction.

**Fallback if pressed on why the headline isn't LLM-only versus heuristic:**

Both numbers are reported in the chapter; the headline is *r*(blended,
heuristic) because that is the comparison the system *deploys*: the
operator's runtime toggle switches between blended mode and
heuristic-only mode, not between LLM-only mode and heuristic-only mode.
Reporting *r*(blended, heuristic) addresses the operational decision the
toggle exposes; reporting *r*(LLM-only, heuristic) addresses the
methodological self-correlation concern. Both are needed; neither is
sufficient on its own.

---

### Q3 — Latency target violation

> *"Section 2.1.2 N1 specifies p95 latency under five seconds. Section
> 4.3.3 reports blended-mode p95 of 20.9 seconds. That is more than
> four times your stated target. How do you defend that?"*

**Primary answer (≈ 60 sec):**

The original single-target specification was empirically infeasible for
the cold-path blended call once measured against Vertex AI Gemini 2.5
Flash. Section 2.1.2 N1 has been split into N1a, the heuristic-mode
target of p95 ≤ 50 ms, and N1b, the blended-mode cold-path target of
p95 ≤ 25 s, dominated by the upstream LLM call. The measured 20.9 s
falls inside N1b. The justification for keeping a target above five
seconds for the blended path is operational: the system runs in a
generative tool context where users expect a brief loading state, not a
real-time response, and the heuristic-only mode satisfies the original
sub-second target whenever a low-latency path is required — the runtime
toggle exposes this trade-off explicitly. The split is documented in
Section 2.1.2 itself; the cached-path latency in production is
materially lower than the cold-path number reported in Section 4.3.3,
as Section 3.9 records.

---

## Likely committee questions — secondary (5 questions)

Rehearse each at least once. Less script-tight than Q1–Q3.

---

### Q4 — Why synthetic, not real applicant data?

> *"Why didn't you measure your system against real resumes and real job
> postings? A synthetic dataset is a weaker evidence base."*

**Answer:** Three reasons. First, IRB and privacy: real resumes contain
personally identifiable information that a single-author Bachelor's
project at faculty scope is not equipped to handle responsibly within
the APD timeline. Second, reproducibility: the synthetic construction is
deterministic from a fixed seed — every reviewer can regenerate the
benchmark byte-for-byte by running `scripts/synthesise_eval_dataset.py`,
which is a stronger reproducibility property than any third-party
corpus could provide. Third, scope honesty: Section 4.1.4 explicitly
labels the result as a *within-set characterisation*, not a
cross-population generalisation; replicating against a multi-author
production corpus is named in Section 5.3 as the next-stage work,
contingent on an institutional partnership that the engineering BSc
scope does not assume. The disjoint-pool regeneration documented in
Section 4.1.4 closed the most actionable threat to validity *given* the
synthetic constraint.

---

### Q5 — Why Vertex AI Gemini 2.5 Flash specifically?

> *"You committed to a single LLM provider. Why this one?"*

**Answer:** Four operational reasons. (1) **Cost:** Gemini 2.5 Flash
input pricing of approximately $0.075 per million tokens is materially
cheaper than the alternatives that supported structured output at the
project's scope. (2) **Structured output:** the `complete_structured`
contract in `services/ai_client.py` depends on JSON-schema-constrained
generation, which Gemini 2.5 Flash supports natively without
post-validation. (3) **Latency:** the median per-call latency observed
in production sits within the N1b cold-path budget. (4) **Architectural
isolation:** the LLM gateway is the only Vertex-coupled module; swapping
to a different provider is a single-file change in `ai_client.py`, as
Section 5.3 argues. The single-provider choice is a scope decision, not
a quality claim — the system architecture supports adding an alternative
provider as a configuration change.

---

### Q6 — Out-of-distribution candidates

> *"What does your system do for a candidate the LLM has never seen in
> training — say, a recently graduated student in a niche specialisation?"*

**Answer:** The system is structured so that this case degrades
gracefully rather than failing silently. The heuristic backbone is
training-distribution-independent: TF–IDF, BM25, ESCO normalisation,
and Levenshtein matching operate on the literal text of the resume and
the job description, with no reliance on a learned representation of
the candidate. The LLM contributes prose-quality evidence — the clarity
sub-score, the cover-letter narrative, the role-fit explanation — but
not the keyword or skill-extraction signal that drives the headline
agreement. For a niche-domain candidate, the heuristic mode produces a
defendable score; the blended mode adds prose-quality evidence on top
without altering the keyword baseline because the heuristic is locked
into the prompt as authoritative ground truth. That this property holds
is not a claim — it is the explicit design property of the locked
prepass described in Section 3.2.3.

---

### Q7 — Differentiation from prior art

> *"How does your work differ from CareerRec [15], Resume2Vec [18], and
> the LLM resume-screening papers [16, 17, 19]?"*

**Answer:** Four axes of differentiation. (1) **Domain:** prior work
targets *resume screening* (the recruiter side); this thesis targets
*career discovery* (the candidate side), which produces qualitatively
different artefacts — six tools in an integrated workflow rather than a
single ranking output. (2) **Deployment:** prior systems are research
notebooks; this thesis presents a deployed web application at
`thecareerworkbench.com` with continuous deployment, observability, and
a documented architecture. (3) **Scoring decomposition:** prior work
produces single-vector scores; this thesis produces a five-axis
breakdown (keywords, impact, structure, clarity, completeness) that
supports per-dimension diagnostic comparisons. (4) **Comparative
methodology:** prior work measures one mode against a baseline; this
thesis measures *two production-deployable modes* against each other on
a controlled within-set benchmark, with explicit threats-to-validity
disclosure and post-mitigation rerun.

---

### Q8 — Why Pearson, why r ≈ 0.7 anchor?

> *"The 0.7 threshold is sometimes used as a quality reference. Is that
> a soft anchor or a hypothesis test? What's your null model?"*

**Answer:** The 0.7 anchor is explicitly framed as a soft reference in
Section 4.3.1 — *not* a frequentist hypothesis test. The chapter does
not claim a *p* < α rejection of any null. The comparison is between two
deterministic scoring rules on the same paired benchmark, so the
relevant inferential question is the *width* of the cross-mode agreement
interval, not its rejection of zero. The cluster-bootstrap CIs reported
in Section 4.3.1' answer that question directly: the post-mitigation
*r*(blended, heuristic) interval is **[0.762, 0.896]**, the *r*(LLM-only,
heuristic) interval is **[0.476, 0.765]**, both honest under the
in-track pairing structure that violates i.i.d. assumptions. If the
committee prefers a different framing — for instance, equivalence
testing against a TOST procedure — the pair-level data are committed to
the repository under `thesis/eval-results.json` and can be re-analysed
without re-running the LLM eval.

---

## Rehearsal protocol

1. **Read each Q–A aloud at least three times** for Q1–Q3 and once for
   Q4–Q8. Read aloud, not silently — the difference matters.
2. **Record yourself answering Q1–Q3 from memory.** Play back; listen
   for hedging tokens ("um", "like", "kinda"), filler clauses, and
   circling. Iterate the 90-second answers until they fit comfortably
   in 60 seconds *under stress*.
3. **Print this document** and bring it to the dry-run with friends or
   family. Have them ask the questions in any order, including
   variations on phrasing.
4. **Do not memorise verbatim.** Internalise the structure (problem →
   evidence → caveat → forward path) so that any rephrasing of the
   committee's question lands on the same backbone.
5. **Final dress rehearsal**: 24 hours before defence, work through Q1
   and Q2 with the actual numbers from the post-mitigation rerun in
   front of you. The committee will check whether you can quote the CI
   intervals, not just the point estimates.

## Index of cited locations in the thesis

- §1.4 — research question framing (controlled within-set characterisation)
- §1.6 — appendix C inventory and Stage F second-pass reduction
- §2.1.2 — N1a / N1b latency split (Q3 anchor)
- §3.2.3 — locked-prepass design (Q2 anchor)
- §4.1.1 — synthetic dataset and disjoint phrase pools (Q1 anchor)
- §4.1.4 — threats T1, T2, T3 (Q1, Q2 anchor)
- §4.3.1 — headline correlation
- §4.3.1' — LLM-only baseline (Q2 anchor; Stage G addition)
- §4.3.3 — latency table (Q3 anchor)
- §4.3.5 — sensitivity to score-combination weights
- §4.4 — bias and fairness (added Stage G)
- §5.3 — future work (LLM-provider abstraction, dataset multi-author replication)

## Numbers to lock in before the dress rehearsal

| Metric | Pre-mitigation (with leakage) | Post-mitigation (disjoint pools) | Δ |
|---|---|---|---|
| *r*(blended, heuristic) | 0.727 [0.609, 0.814] | **0.836 [0.762, 0.896]** | +0.109 |
| *r*(LLM-only, heuristic) | 0.493 [0.269, 0.645] | **0.627 [0.476, 0.765]** | +0.134 |
| *r*(blended, LLM-only) | 0.956 [0.912, 0.975] | 0.952 [0.923, 0.973] | −0.004 |
| ρ (blended, heuristic) | 0.708 | **0.847** | +0.139 |
| τ (blended, heuristic) | 0.526 | 0.669 | +0.143 |
| keywords sub-score *r* | 0.941 | 0.937 | −0.004 |
| structure sub-score *r* | 0.440 | 0.830 | +0.390 |
| impact sub-score *r* | 0.561 | 0.430 | −0.131 |
| clarity sub-score *r* | 0.475 | 0.395 | −0.080 |
| completeness sub-score *r* | 0.691 | 0.756 | +0.065 |
| KS distance (blended vs heuristic) | 0.200 | 0.100 | −0.100 |
| Per-pair content-token overlap (mean) | 11.82 | 0.44 | 27× reduction |

> The headline *r* moved from 0.727 to 0.836 — a +0.109 *increase*
> after T1 mitigation, contrary to the leakage-driven inflation
> hypothesis. Be ready to explain this counter-intuitive result in
> Q1's fallback path: the leakage version inflated the keyword axis
> but distorted structure and bullet-density agreement; the disjoint-
> pool regeneration removes the artefactual lexical sharing without
> removing the legitimate skill-overlap signal, and reveals a
> cleaner, higher cross-mode agreement than the leakage version had
> recorded.
