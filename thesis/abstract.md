# Abstract — Streszczenie / Abstract

---

::: {lang=pl}
## Streszczenie

W pracy przedstawiono projekt, implementację oraz ewaluację systemu opartego na sztucznej inteligencji do spersonalizowanego doradztwa zawodowego. System, wdrożony jako aplikacja webowa na zarządzanej platformie chmurowej, integruje sześć komplementarnych narzędzi: analizę CV, dopasowanie do oferty pracy, sugestię ścieżki kariery, generowanie listu motywacyjnego, przygotowanie do rozmowy kwalifikacyjnej oraz planowanie portfolio. Frontend zbudowano w technologiach React 19 i TanStack Start; backend wykorzystuje FastAPI oraz PostgreSQL; wnioskowanie modelu językowego delegowano do usługi Google Vertex AI Gemini 2.5 Flash.

W odpowiedzi na obawy dotyczące kosztu, opóźnienia oraz zależności od zewnętrznego dostawcy modelu rdzeń analityczny systemu obsługuje dwa przełączalne w czasie działania tryby oceny. *Tryb mieszany* łączy deterministyczną heurystykę ze strukturalnym wyjściem modelu językowego (40% / 60%). *Tryb w pełni heurystyczny* opiera się na klasycznych metodach wyszukiwania informacji: ważeniu słów kluczowych metodą TF–IDF i rankingowi BM25, normalizacji umiejętności zgodnej z taksonomią ESCO, dopasowaniu rozmytym oraz ekstrakcji cech ważonych sekcjami.

Kontrolowane studium porównawcze oceniło oba tryby na 100 parach (CV, opis stanowiska) obejmujących sześć ścieżek zawodowych. Zbiór ewaluacyjny składa się z deterministycznie wygenerowanych par syntetycznych CV i opisów stanowisk skonstruowanych z rozłącznych słownikowo pul fraz; strona CV i strona opisu stanowiska nie współdzielą słownictwa treściowego poza kanonicznymi nazwami umiejętności. W tym zbiorze tryb w pełni heurystyczny śledzi tryb mieszany przy Pearsonowskim *r* = 0,836 [95-proc. przedział ufności: 0,762–0,896; bootstrap klastrowy względem identyfikatora CV] oraz Spearmanowskim ρ = 0,847, działa około dwa do trzech rzędów wielkości szybciej (mediana 25,5 ms wobec 18,2 s) oraz nie ponosi krańcowego kosztu po stronie modelu językowego.

Korelacja między samym modelem językowym a trybem heurystycznym, odzyskana post-hoc z tożsamości formuły mieszanej w celu odseparowania składowej strukturalnej, wynosi *r* = 0,627 [95-proc. przedział ufności: 0,470–0,758]. Tryb mieszany pozostaje wartościowy w ocenie jakości prozy: na osi *clarity* zgodność między obydwoma trybami spada do *r* = 0,395, co wskazuje, że w tym wymiarze deterministyczna heurystyka nie zastępuje modelu językowego. Ograniczenia obejmują zakres jednojęzyczny (angielski), syntetyczny zbiór jednego autora oraz pojedynczą konfigurację dostawcy modelu językowego. Dalsze prace obejmują rozszerzenie pokrycia językowego na polski, pośredni poziom dopasowania semantycznego oparty na transformatorach zdań, integrację komponentu wyszukiwania wspomagającego oraz wymianę pamięci podręcznej procesu na Redis.

**Słowa kluczowe:** doradztwo zawodowe, analiza CV, duże modele językowe, wyszukiwanie informacji, taksonomia ESCO, ocena hybrydowa, FastAPI, React.
:::

## Abstract (English)

This thesis presents the design, implementation, and evaluation of an AI-based system for personalised career recommendation. The deployed web application integrates six tools: resume analysis, job-description matching, career-path suggestion, cover-letter generation, interview preparation, and portfolio planning. The frontend uses React 19 and TanStack Start; the backend uses FastAPI and PostgreSQL; language-model inference is delegated to Google Vertex AI Gemini 2.5 Flash.

To address cost, latency, and external-provider dependence, the analytical core supports two runtime-switchable scoring modes. The *blended mode* combines a deterministic heuristic with the language model's structured output at 40% / 60% weighting. The *fully heuristic mode* uses classical information-retrieval methods: TF–IDF and BM25 keyword evidence, ESCO-aligned skill normalisation, string-similarity fuzzy matching, and section-weighted feature extraction.

A controlled comparative study evaluated both modes on 100 synthetic resume/job-description pairs spanning six role tracks. The benchmark was deterministically generated under a disjoint-vocabulary construction: resume-side and job-description-side phrase pools share no content-word vocabulary beyond canonical skill terms. Within this benchmark, heuristic mode tracks blended mode at Pearson *r* = 0.836 [95% CI 0.762, 0.896 under cluster bootstrap on resume identity] and Spearman ρ = 0.847, while running much faster (median 25.5 ms vs 18.2 s) and incurring zero LLM-side marginal cost. The post-hoc LLM-only-versus-heuristic correlation is *r* = 0.627 [95% CI 0.470, 0.758], after controlling for the 0.40 heuristic share embedded in the blended formula.

These results support the heuristic mode as a fast, auditable fallback, while the blended mode retains value on prose-quality evidence (clarity sub-score *r* = 0.395). Limitations include English-only evaluation, a single-author synthetic dataset, and one LLM provider. Future work proposes Polish-language coverage (ESCO label expansion, Polish-aware preprocessing, section detection, and bilingual evaluation), a sentence-transformer intermediate tier, retrieval-augmented grounding, and a Redis-backed shared cache.

**Keywords:** career recommendation, resume analysis, large language models, information retrieval, ESCO taxonomy, hybrid scoring, FastAPI, React.
