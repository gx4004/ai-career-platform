"""Generate the expanded ESCO skill taxonomy used by quality_signals_v3 (Stage H.5).

Produces backend/app/data/esco_skills_expanded.json by extending the baseline
107-entry curated subset with ~200 hand-curated additional entries spanning
backend frameworks, databases, DevOps/cloud, data engineering, frontend, ML/AI,
mobile, security, soft skills, and management methodology.

The expanded taxonomy is opt-in via:
    * `features` set passed to build_resume_prepass_v3, or
    * ESCO_VARIANT=expanded environment variable.

All baseline entries are preserved verbatim so the heuristic v3 ESCO-baseline
ablation cell behaves identically to v2 by construction.

Stage H.5 scope note: the official ESCO v1.1.1 dump contains 13.9k+ skill
labels. This expansion is a hand-curated middle ground (~280 entries) that
demonstrably broadens the recall surface without committing to the full ESCO
import (which would require licence-attribution-aware filtering and is the
proper Path A in a follow-up round). The scope is documented in the
Chapter 4.3 ablation section as a Path-B execution.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / "backend" / "app" / "data" / "esco_skills.json"
OUT = ROOT / "backend" / "app" / "data" / "esco_skills_expanded.json"


# Hand-curated additions — grouped for review-ability. All variants are
# lowercase by construction; the loader filters short alphabetic variants
# (length < 3) to prevent collision with English vocabulary.

ADDITIONS: list[dict[str, list[str] | str]] = [
    # -- Backend frameworks / runtimes -------------------------------------
    {"canonical": "NestJS", "variants": ["nestjs", "nest js", "nest.js"]},
    {"canonical": "Spring Boot", "variants": ["spring boot", "springboot", "spring framework", "spring"]},
    {"canonical": "Quarkus", "variants": ["quarkus"]},
    {"canonical": "Micronaut", "variants": ["micronaut"]},
    {"canonical": "Gin (Go framework)", "variants": ["gin framework", "gin gonic"]},
    {"canonical": "Echo (Go framework)", "variants": ["echo framework"]},
    {"canonical": "Fiber (Go framework)", "variants": ["fiber framework", "go fiber"]},
    {"canonical": "Phoenix Framework", "variants": ["phoenix framework", "phoenix elixir"]},
    {"canonical": "Symfony", "variants": ["symfony"]},
    {"canonical": "ASP.NET Core", "variants": ["asp.net core", "asp net core", "aspnet core", "dotnet core"]},
    {"canonical": "Actix Web", "variants": ["actix", "actix web"]},
    {"canonical": "Axum (Rust framework)", "variants": ["axum"]},
    {"canonical": "Hapi.js", "variants": ["hapi", "hapijs", "hapi.js"]},
    {"canonical": "Koa.js", "variants": ["koa", "koajs", "koa.js"]},
    {"canonical": "Tornado", "variants": ["tornado web", "tornado framework"]},
    {"canonical": "Pyramid", "variants": ["pyramid framework"]},
    {"canonical": "Sanic", "variants": ["sanic framework"]},
    {"canonical": "Starlette", "variants": ["starlette"]},
    {"canonical": "Tokio", "variants": ["tokio runtime"]},
    {"canonical": "Hibernate", "variants": ["hibernate orm", "hibernate"]},
    {"canonical": "SQLAlchemy", "variants": ["sqlalchemy", "sql alchemy"]},
    {"canonical": "Sequelize", "variants": ["sequelize", "sequelize orm"]},
    {"canonical": "Prisma", "variants": ["prisma", "prisma orm"]},
    {"canonical": "TypeORM", "variants": ["typeorm", "type orm"]},

    # -- Database systems --------------------------------------------------
    {"canonical": "Apache Cassandra", "variants": ["cassandra", "apache cassandra"]},
    {"canonical": "Amazon DynamoDB", "variants": ["dynamodb", "dynamo db", "amazon dynamodb"]},
    {"canonical": "Couchbase", "variants": ["couchbase"]},
    {"canonical": "CouchDB", "variants": ["couchdb", "apache couchdb"]},
    {"canonical": "Neo4j", "variants": ["neo4j", "neo 4j", "graph database"]},
    {"canonical": "Azure Cosmos DB", "variants": ["cosmos db", "cosmosdb", "azure cosmos"]},
    {"canonical": "ClickHouse", "variants": ["clickhouse", "click house"]},
    {"canonical": "DuckDB", "variants": ["duckdb", "duck db"]},
    {"canonical": "SQLite", "variants": ["sqlite", "sqlite3"]},
    {"canonical": "Apache HBase", "variants": ["hbase", "apache hbase"]},
    {"canonical": "InfluxDB", "variants": ["influxdb", "influx db", "time series database"]},
    {"canonical": "TimescaleDB", "variants": ["timescaledb", "timescale db"]},
    {"canonical": "ArangoDB", "variants": ["arangodb", "arango db"]},
    {"canonical": "ScyllaDB", "variants": ["scylladb", "scylla db"]},
    {"canonical": "Memcached", "variants": ["memcached", "memcache"]},
    {"canonical": "etcd", "variants": ["etcd"]},
    {"canonical": "Apache Solr", "variants": ["solr", "apache solr"]},
    {"canonical": "OpenSearch", "variants": ["opensearch", "open search"]},
    {"canonical": "Pinecone (vector DB)", "variants": ["pinecone", "vector store"]},
    {"canonical": "Weaviate", "variants": ["weaviate"]},
    {"canonical": "Chroma (vector DB)", "variants": ["chroma db", "chromadb"]},
    {"canonical": "Qdrant", "variants": ["qdrant"]},
    {"canonical": "FAISS", "variants": ["faiss", "facebook ai similarity search"]},
    {"canonical": "Milvus", "variants": ["milvus"]},

    # -- DevOps / cloud / orchestration -----------------------------------
    {"canonical": "Ansible", "variants": ["ansible", "ansible playbook"]},
    {"canonical": "Puppet", "variants": ["puppet"]},
    {"canonical": "Chef", "variants": ["chef configuration"]},
    {"canonical": "Pulumi", "variants": ["pulumi"]},
    {"canonical": "AWS CloudFormation", "variants": ["cloudformation", "cloud formation", "aws cloudformation"]},
    {"canonical": "Argo CD", "variants": ["argo cd", "argocd"]},
    {"canonical": "Flux CD", "variants": ["flux cd", "fluxcd"]},
    {"canonical": "Istio", "variants": ["istio", "service mesh"]},
    {"canonical": "Linkerd", "variants": ["linkerd"]},
    {"canonical": "Consul", "variants": ["consul"]},
    {"canonical": "Vault (HashiCorp)", "variants": ["hashicorp vault", "hashi vault"]},
    {"canonical": "GitLab CI", "variants": ["gitlab ci", "gitlab pipelines", "gitlab ci/cd"]},
    {"canonical": "CircleCI", "variants": ["circleci", "circle ci"]},
    {"canonical": "Jenkins", "variants": ["jenkins", "jenkins pipeline"]},
    {"canonical": "Travis CI", "variants": ["travis ci", "travisci"]},
    {"canonical": "Bazel", "variants": ["bazel build"]},
    {"canonical": "Make (build system)", "variants": ["makefile", "gnu make"]},
    {"canonical": "Bash scripting", "variants": ["bash scripting", "shell script", "shell scripting"]},
    {"canonical": "Heroku", "variants": ["heroku"]},
    {"canonical": "Railway (PaaS)", "variants": ["railway app", "railway platform"]},
    {"canonical": "Render (PaaS)", "variants": ["render.com", "render platform"]},
    {"canonical": "Vercel", "variants": ["vercel"]},
    {"canonical": "Netlify", "variants": ["netlify"]},
    {"canonical": "Cloudflare", "variants": ["cloudflare", "cloudflare workers"]},
    {"canonical": "Fastly", "variants": ["fastly cdn"]},
    {"canonical": "DigitalOcean", "variants": ["digitalocean", "digital ocean"]},
    {"canonical": "Datadog", "variants": ["datadog"]},
    {"canonical": "New Relic", "variants": ["new relic", "newrelic"]},
    {"canonical": "PagerDuty", "variants": ["pagerduty", "pager duty"]},
    {"canonical": "OpenTelemetry", "variants": ["opentelemetry", "open telemetry", "otel"]},
    {"canonical": "Splunk", "variants": ["splunk"]},

    # -- Data engineering --------------------------------------------------
    {"canonical": "dbt (data build tool)", "variants": ["dbt core", "data build tool"]},
    {"canonical": "Apache Beam", "variants": ["apache beam", "beam pipeline"]},
    {"canonical": "Apache Flink", "variants": ["flink", "apache flink"]},
    {"canonical": "Apache Hadoop", "variants": ["hadoop", "apache hadoop", "mapreduce"]},
    {"canonical": "Apache NiFi", "variants": ["apache nifi", "nifi"]},
    {"canonical": "Apache Iceberg", "variants": ["apache iceberg", "iceberg table"]},
    {"canonical": "Apache Hudi", "variants": ["apache hudi", "hudi"]},
    {"canonical": "Delta Lake", "variants": ["delta lake", "deltalake"]},
    {"canonical": "Databricks", "variants": ["databricks", "databricks platform"]},
    {"canonical": "Snowflake", "variants": ["snowflake warehouse", "snowflake data cloud"]},
    {"canonical": "Dagster", "variants": ["dagster"]},
    {"canonical": "Prefect", "variants": ["prefect orchestration"]},
    {"canonical": "Luigi (workflow)", "variants": ["luigi pipeline", "luigi workflow"]},
    {"canonical": "Fivetran", "variants": ["fivetran"]},
    {"canonical": "Stitch (data)", "variants": ["stitch data"]},
    {"canonical": "Airbyte", "variants": ["airbyte"]},
    {"canonical": "Looker", "variants": ["looker", "looker studio"]},
    {"canonical": "Metabase", "variants": ["metabase"]},
    {"canonical": "Mode Analytics", "variants": ["mode analytics"]},
    {"canonical": "Apache Druid", "variants": ["druid", "apache druid"]},

    # -- Frontend / web ----------------------------------------------------
    {"canonical": "Solid.js", "variants": ["solid js", "solidjs", "solid.js"]},
    {"canonical": "Qwik", "variants": ["qwik framework"]},
    {"canonical": "Astro", "variants": ["astro framework", "astro build"]},
    {"canonical": "Remix", "variants": ["remix framework", "remix run"]},
    {"canonical": "Lit (web components)", "variants": ["lit element", "lit framework"]},
    {"canonical": "Stencil", "variants": ["stencil js", "stenciljs"]},
    {"canonical": "Preact", "variants": ["preact"]},
    {"canonical": "Alpine.js", "variants": ["alpine js", "alpinejs", "alpine.js"]},
    {"canonical": "HTMX", "variants": ["htmx"]},
    {"canonical": "Storybook", "variants": ["storybook"]},
    {"canonical": "Redux", "variants": ["redux", "redux toolkit"]},
    {"canonical": "MobX", "variants": ["mobx state"]},
    {"canonical": "Zustand", "variants": ["zustand state"]},
    {"canonical": "TanStack Query", "variants": ["tanstack query", "react query"]},
    {"canonical": "TanStack Router", "variants": ["tanstack router"]},
    {"canonical": "Material UI", "variants": ["material ui", "mui library"]},
    {"canonical": "shadcn/ui", "variants": ["shadcn", "shadcn ui"]},
    {"canonical": "Bootstrap", "variants": ["bootstrap css", "twitter bootstrap"]},
    {"canonical": "Three.js", "variants": ["three js", "threejs", "three.js"]},
    {"canonical": "WebGL", "variants": ["webgl", "web gl"]},
    {"canonical": "Web Components", "variants": ["web components", "custom elements"]},
    {"canonical": "Service workers", "variants": ["service worker", "service workers"]},
    {"canonical": "Progressive web apps", "variants": ["pwa", "progressive web app"]},

    # -- Mobile development ------------------------------------------------
    {"canonical": "React Native", "variants": ["react native"]},
    {"canonical": "Flutter", "variants": ["flutter framework", "dart flutter"]},
    {"canonical": "Swift", "variants": ["swift language", "swift programming"]},
    {"canonical": "Kotlin", "variants": ["kotlin language"]},
    {"canonical": "SwiftUI", "variants": ["swiftui"]},
    {"canonical": "Jetpack Compose", "variants": ["jetpack compose", "android compose"]},
    {"canonical": "Xamarin", "variants": ["xamarin"]},
    {"canonical": "Ionic Framework", "variants": ["ionic framework", "ionic app"]},
    {"canonical": "Expo (React Native)", "variants": ["expo framework", "expo go"]},
    {"canonical": "Android SDK", "variants": ["android sdk", "android development"]},
    {"canonical": "iOS SDK", "variants": ["ios sdk", "ios development"]},
    {"canonical": "Objective-C", "variants": ["objective c", "objc", "objective-c"]},

    # -- ML / AI / LLM ecosystem ------------------------------------------
    {"canonical": "JAX", "variants": ["jax framework", "google jax"]},
    {"canonical": "Hugging Face", "variants": ["huggingface", "hugging face", "huggingface hub"]},
    {"canonical": "LangChain", "variants": ["langchain", "lang chain"]},
    {"canonical": "LlamaIndex", "variants": ["llamaindex", "llama index"]},
    {"canonical": "vLLM", "variants": ["vllm"]},
    {"canonical": "Ollama", "variants": ["ollama"]},
    {"canonical": "MLflow", "variants": ["mlflow", "ml flow"]},
    {"canonical": "Weights & Biases", "variants": ["weights and biases", "wandb", "w&b"]},
    {"canonical": "Kubeflow", "variants": ["kubeflow"]},
    {"canonical": "Ray (distributed compute)", "variants": ["ray serve", "ray framework"]},
    {"canonical": "DVC (data version control)", "variants": ["dvc", "data version control"]},
    {"canonical": "ONNX", "variants": ["onnx runtime", "open neural network exchange"]},
    {"canonical": "Triton Inference Server", "variants": ["triton inference", "nvidia triton"]},
    {"canonical": "Stable Diffusion", "variants": ["stable diffusion", "diffusers"]},
    {"canonical": "OpenCV", "variants": ["opencv", "open cv"]},
    {"canonical": "spaCy", "variants": ["spacy", "spa cy"]},
    {"canonical": "NLTK", "variants": ["nltk"]},
    {"canonical": "Gensim", "variants": ["gensim"]},
    {"canonical": "XGBoost", "variants": ["xgboost", "xg boost"]},
    {"canonical": "LightGBM", "variants": ["lightgbm", "light gbm"]},
    {"canonical": "CatBoost", "variants": ["catboost"]},
    {"canonical": "Reinforcement learning", "variants": ["reinforcement learning", "deep reinforcement learning"]},
    {"canonical": "Time series forecasting", "variants": ["time series", "forecasting"]},
    {"canonical": "Recommender systems", "variants": ["recommender system", "recommendation engine"]},
    {"canonical": "Embeddings", "variants": ["embeddings", "word embeddings", "sentence embeddings"]},
    {"canonical": "Prompt engineering", "variants": ["prompt engineering", "prompt design"]},
    {"canonical": "Fine-tuning", "variants": ["fine tuning", "fine-tuning", "lora", "qlora"]},
    {"canonical": "Sentence Transformers", "variants": ["sentence transformers", "sbert"]},
    {"canonical": "BM25", "variants": ["bm25", "okapi bm25"]},
    {"canonical": "TF-IDF", "variants": ["tf idf", "tf-idf", "tfidf"]},

    # -- Methodology / architecture ---------------------------------------
    {"canonical": "Domain-driven design", "variants": ["ddd", "domain driven design", "domain-driven design"]},
    {"canonical": "Event-driven architecture", "variants": ["event driven", "event-driven architecture", "eda"]},
    {"canonical": "Hexagonal architecture", "variants": ["hexagonal architecture", "ports and adapters"]},
    {"canonical": "Clean architecture", "variants": ["clean architecture"]},
    {"canonical": "CQRS", "variants": ["cqrs", "command query responsibility"]},
    {"canonical": "Event sourcing", "variants": ["event sourcing"]},
    {"canonical": "Behaviour-driven development", "variants": ["bdd", "behaviour driven development", "behavior driven development"]},
    {"canonical": "Pair programming", "variants": ["pair programming", "pairing"]},
    {"canonical": "Mob programming", "variants": ["mob programming"]},
    {"canonical": "Twelve-factor app", "variants": ["12 factor", "twelve factor", "12-factor"]},
    {"canonical": "Refactoring", "variants": ["refactoring", "code refactor"]},
    {"canonical": "Software design patterns", "variants": ["design patterns", "gof patterns"]},
    {"canonical": "SOLID principles", "variants": ["solid principles", "solid design"]},
    {"canonical": "Continuous deployment", "variants": ["continuous deployment", "cd pipeline"]},
    {"canonical": "Incident response", "variants": ["incident response", "incident management", "post mortem", "postmortem"]},
    {"canonical": "Chaos engineering", "variants": ["chaos engineering", "chaos monkey"]},
    {"canonical": "Site reliability engineering", "variants": ["sre", "site reliability"]},
    {"canonical": "DevSecOps", "variants": ["devsecops", "dev sec ops"]},

    # -- Security / compliance --------------------------------------------
    {"canonical": "Static application security testing", "variants": ["sast", "static analysis"]},
    {"canonical": "Dynamic application security testing", "variants": ["dast", "dynamic security testing"]},
    {"canonical": "Software composition analysis", "variants": ["sca", "dependency scanning"]},
    {"canonical": "SOC 2 compliance", "variants": ["soc 2", "soc2", "soc-2"]},
    {"canonical": "ISO 27001", "variants": ["iso 27001", "iso27001"]},
    {"canonical": "HIPAA", "variants": ["hipaa", "health insurance portability"]},
    {"canonical": "PCI DSS", "variants": ["pci dss", "pci-dss"]},
    {"canonical": "Zero trust security", "variants": ["zero trust", "zero-trust"]},
    {"canonical": "Threat modelling", "variants": ["threat modelling", "threat modeling"]},
    {"canonical": "Cryptography", "variants": ["cryptography", "crypto", "tls", "encryption at rest"]},
    {"canonical": "Identity and access management", "variants": ["iam", "identity management", "access management"]},
    {"canonical": "Single sign-on", "variants": ["sso", "single sign on"]},
    {"canonical": "SAML", "variants": ["saml", "saml 2.0"]},

    # -- Soft / management skills ------------------------------------------
    {"canonical": "Communication skills", "variants": ["communication skills", "verbal communication", "written communication"]},
    {"canonical": "Negotiation", "variants": ["negotiation", "contract negotiation"]},
    {"canonical": "Leadership", "variants": ["leadership", "team leadership", "tech lead"]},
    {"canonical": "Decision-making", "variants": ["decision making", "decision-making"]},
    {"canonical": "Conflict resolution", "variants": ["conflict resolution"]},
    {"canonical": "Time management", "variants": ["time management", "prioritisation", "prioritization"]},
    {"canonical": "Critical thinking", "variants": ["critical thinking"]},
    {"canonical": "Analytical thinking", "variants": ["analytical thinking", "analytical mindset"]},
    {"canonical": "Empathy", "variants": ["empathy", "empathetic"]},
    {"canonical": "Active listening", "variants": ["active listening"]},
    {"canonical": "Adaptability", "variants": ["adaptability", "adaptable"]},
    {"canonical": "Problem solving", "variants": ["problem solving", "problem-solving"]},
    {"canonical": "Strategic thinking", "variants": ["strategic thinking", "strategy"]},
    {"canonical": "Customer orientation", "variants": ["customer orientation", "customer focus", "customer obsession"]},
    {"canonical": "Cross-cultural collaboration", "variants": ["cross cultural", "cross-cultural", "multicultural"]},
    {"canonical": "Remote work", "variants": ["remote work", "distributed teams", "async work"]},
    {"canonical": "Hiring and recruiting", "variants": ["hiring", "recruiting", "interviewing candidates"]},
    {"canonical": "Onboarding", "variants": ["onboarding"]},
    {"canonical": "Performance management", "variants": ["performance management", "performance reviews"]},
    {"canonical": "Budget management", "variants": ["budget management", "budgeting"]},
    {"canonical": "Vendor management", "variants": ["vendor management"]},
    {"canonical": "Risk management", "variants": ["risk management"]},

    # -- Product / design / business --------------------------------------
    {"canonical": "Product strategy", "variants": ["product strategy"]},
    {"canonical": "Product analytics", "variants": ["product analytics", "amplitude", "mixpanel"]},
    {"canonical": "User journey mapping", "variants": ["user journey", "journey mapping"]},
    {"canonical": "Usability testing", "variants": ["usability testing", "user testing"]},
    {"canonical": "Information architecture", "variants": ["information architecture", "ia design"]},
    {"canonical": "Visual design", "variants": ["visual design", "graphic design"]},
    {"canonical": "Motion design", "variants": ["motion design", "motion graphics"]},
    {"canonical": "Brand strategy", "variants": ["brand strategy", "branding"]},
    {"canonical": "Content strategy", "variants": ["content strategy"]},
    {"canonical": "Copywriting", "variants": ["copywriting"]},
    {"canonical": "SEO", "variants": ["seo", "search engine optimisation", "search engine optimization"]},
    {"canonical": "Digital marketing", "variants": ["digital marketing", "growth marketing"]},
    {"canonical": "Lifecycle marketing", "variants": ["lifecycle marketing", "email marketing", "crm marketing"]},
    {"canonical": "Sales operations", "variants": ["sales operations", "sales ops"]},

    # -- Languages / locales (knowledge skills) ----------------------------
    {"canonical": "English (language)", "variants": ["english language", "english fluent", "fluent english"]},
    {"canonical": "Polish (language)", "variants": ["polish language", "polski"]},
    {"canonical": "German (language)", "variants": ["german language", "deutsch"]},
    {"canonical": "Spanish (language)", "variants": ["spanish language", "español"]},
    {"canonical": "French (language)", "variants": ["french language", "français"]},

    # -- Specialised CS topics --------------------------------------------
    {"canonical": "Compilers", "variants": ["compilers", "compiler design"]},
    {"canonical": "Operating systems", "variants": ["operating systems", "os internals"]},
    {"canonical": "Distributed systems", "variants": ["distributed systems"]},
    {"canonical": "Concurrent programming", "variants": ["concurrency", "concurrent programming", "multithreading"]},
    {"canonical": "Functional programming", "variants": ["functional programming", "fp"]},
    {"canonical": "Algorithms and data structures", "variants": ["algorithms", "data structures"]},
    {"canonical": "Big-O analysis", "variants": ["big o", "big-o", "complexity analysis"]},
    {"canonical": "Networking (TCP/IP)", "variants": ["tcp ip", "tcp/ip", "networking"]},
    {"canonical": "WebRTC", "variants": ["webrtc"]},
    {"canonical": "Blockchain", "variants": ["blockchain", "ethereum", "solidity", "web3"]},
    {"canonical": "Smart contracts", "variants": ["smart contracts"]},
]


def main() -> int:
    baseline_payload = json.loads(BASELINE.read_text(encoding="utf-8"))
    baseline_skills: list[dict] = baseline_payload.get("skills", [])
    baseline_canonicals = {s["canonical"] for s in baseline_skills}

    deduped_additions: list[dict] = []
    seen = set(baseline_canonicals)
    for entry in ADDITIONS:
        c = entry["canonical"]
        if c in seen:
            continue
        seen.add(c)
        deduped_additions.append(entry)

    expanded = list(baseline_skills) + deduped_additions

    # Sanity: dedupe variant collisions across the whole list (last-wins is
    # acceptable; canonical names are still distinct).
    variant_seen: dict[str, str] = {}
    collisions: list[tuple[str, str, str]] = []
    for entry in expanded:
        for v in entry.get("variants", []):
            v = v.lower().strip()
            if v in variant_seen and variant_seen[v] != entry["canonical"]:
                collisions.append((v, variant_seen[v], entry["canonical"]))
            variant_seen[v] = entry["canonical"]

    payload = {
        "_metadata": {
            "description": (
                "Hand-curated expansion of the baseline ESCO skill subset, "
                "produced for the Stage H ablation in Chapter 4.3 of the "
                "thesis. Path B execution: extends the baseline 107 entries "
                "with ~200 additional canonical labels covering modern "
                "backend frameworks, databases, DevOps tooling, data "
                "engineering, frontend frameworks, mobile, ML/AI ecosystem, "
                "security/compliance, soft skills, and product/design."
            ),
            "source": (
                "Baseline rows verbatim from "
                "https://esco.ec.europa.eu/en/download (CC BY 4.0, "
                "European Commission). Additional rows hand-curated from "
                "common job-posting vocabulary and the O*NET parallel "
                "taxonomy (https://www.onetonline.org/) — not re-attributed "
                "to ESCO."
            ),
            "subset_scope": (
                "Digital, creative, and business-services skills relevant "
                "to the six role tracks in the evaluation set, plus an "
                "expanded long tail of supporting tools and methodologies."
            ),
            "version": "v0.2 — Stage H ESCO expansion (Path B, hand-curated)",
            "license": (
                "Baseline rows under CC BY 4.0 (attribute the European "
                "Commission). Additional rows are author-curated; treat "
                "them as Path-B extensions pending a Path-A re-derivation "
                "from the ESCO v1.1.1 official static export."
            ),
            "entry_count": len(expanded),
            "baseline_count": len(baseline_skills),
            "added_count": len(deduped_additions),
            "variant_collisions": len(collisions),
        },
        "skills": expanded,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} — {len(expanded)} entries (baseline {len(baseline_skills)} + added {len(deduped_additions)})")
    if collisions:
        print(f"WARNING: {len(collisions)} variant collisions (last-wins applied):")
        for v, prev, cur in collisions[:10]:
            print(f"  '{v}' was '{prev}' → now '{cur}'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
