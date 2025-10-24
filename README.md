# Personalized Education Agent (PEA)

**Repository:** `personalized-education-agent`


---

# Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Architecture & Components](#architecture--components)
4. [Tech Stack](#tech-stack)
5. [Folder Structure](#folder-structure)
6. [Quick start — Local Development](#quick-start--local-development)
7. [API Reference](#api-reference)
8. [Data & Models](#data--models)
9. [Training & Evaluation](#training--evaluation)
10. [Teacher Dashboard & UX](#teacher-dashboard--ux)
11. [Deployment](#deployment)
12. [CI / CD](#ci--cd)
13. [Testing Strategy](#testing-strategy)
14. [Security & Privacy](#security--privacy)
15. [Contributing & Roadmap](#contributing--roadmap)
16. [Acknowledgements & References](#acknowledgements--references)

---

# Project Overview

The **Personalized Education Agent (PEA)** is a research-grade, agentic learning platform that dynamically models learner mastery and generates personalized instructional content in real time. The platform's core capability is a "Knowledge Tracker" for fine-grained mastery estimation together with a Generative Content Engine that creates tailored problems, hints, and explanations.

Primary goals:

* Provide individualized learning paths that adapt to student ability and pace.
* Deliver instant, pedagogically useful feedback that explains *why* an answer is incorrect and gives targeted remediation.
* Supply teachers with actionable dashboards that highlight at-risk students and recommend interventions.

This README is a complete, demo-ready repository scaffold that documents architecture, interfaces, data flows, sample commands, and reproducible model-training recipes for portfolio or academic demonstration.

---

# Key Features

* Knowledge tracing engine (Bayesian + deep-learning hybrid)
* Generative Content Engine (fine-tuned LLM prompts & retrieval augmentation)
* Item difficulty calibration (IRT-inspired static/dynamic models)
* Real-time feedback loop with low-latency API
* Teacher analytics dashboard with cohort & per-student views
* Synthetic student simulator for stress-testing and AB experiments
* Full DevOps-ready Docker/Kubernetes deployment with sample manifests

---

# Architecture & Components

High-level components:

1. **Client (Web/React)** — student and teacher-facing UI.
2. **API Gateway (Express/Node.js)** — authentication, routing, rate-limiting.
3. **Content Service (Python / FastAPI)** — content generation, item templating, caching.
4. **Knowledge Tracker Service (Python / Flask)** — real-time mastery estimation and update API.
5. **Model Training Pipeline (Airflow + PySpark optional)** — offline training, calibration, and export.
6. **Vector DB + Retriever (FAISS/Weaviate)** — supports retrieval-augmented generation (RAG).
7. **Metadata Store (Postgres)** — users, items, item metadata, attempts.
8. **Time-series DB (InfluxDB / ClickHouse)** — telemetry and event metrics.
9. **Dashboard (Streamlit / React + Recharts)** — teacher analytics and cohort monitoring.

Sequence example (student attempt flow):

1. Student requests next item → API requests Knowledge Tracker for recommended item.
2. Knowledge Tracker returns an item id and difficulty target.
3. Content Service renders item (template + variables) and logs attempt.
4. Student submits answer → API forwards to scoring + immediate feedback generation via Gen Engine.
5. Knowledge Tracker updates student's mastery profile and writes to Postgres + event pipeline.
6. Dashboard and analytics reflect updated mastery within seconds.

---

# Tech Stack

* Frontend: React, Tailwind CSS, TypeScript
* Backend: Node.js (API Gateway), FastAPI/Flask for ML services
* ML: PyTorch, Hugging Face Transformers, scikit-learn
* Databases: PostgreSQL (primary), Redis (cache), FAISS (vector search), ClickHouse (analytics)
* Orchestration: Docker, Kubernetes (Helm charts included)
* CI: GitHub Actions
* Monitoring: Prometheus + Grafana

---

# Folder Structure

```
personalized-education-agent/
├── README.md                # This file (demo)
├── docs/                    # Design docs, architecture diagrams, research notes
├── web/                     # React student + teacher apps
│   ├── student/
│   └── teacher/
├── services/
│   ├── api-gateway/         # Node.js / Express
│   ├── content-service/     # FastAPI - content generation and templating
│   ├── tracker-service/     # Flask - knowledge tracer and policy
│   └── trainer/             # scripts, notebooks, training pipelines
├── infra/
│   ├── docker/              # Dockerfiles for each service
│   ├── k8s/                 # Kubernetes manifests and Helm charts
│   └── ci/                  # GitHub Actions workflows
├── models/                  # Exported model artifacts (.pt/.bin) & model registry metadata
├── samples/                 # Sample datasets, synthetic students, demo scripts
├── notebooks/               # Jupyter notebooks for exploration and results
└── tests/                   # Unit & integration tests
```

---

# Quick start — Local Development

> Requirements: Docker (20+), Docker Compose, Node 18+, Python 3.10+, git

1. Clone the repo

```bash
git clone https://github.com/fake-org/personalized-education-agent.git
cd personalized-education-agent
```

2. Create `.env` from sample

```bash
cp .env.example .env
# Edit sample values (DB passwords, API keys)
```

3. Start services locally (dev mode)

```bash
docker-compose -f infra/docker/docker-compose.dev.yml up --build
```

4. Run migrations & seed demo data

```bash
docker exec -it pea_postgres psql -U postgres -d pea_db -f /docker-entrypoint-initdb.d/seed.sql
```

5. Open student UI: `http://localhost:3000`
   Open teacher UI: `http://localhost:3001`

---

# API Reference (Summary)

Base URL (dev): `http://localhost:8000/api`

## Auth

* `POST /auth/register` — register user (student/teacher/admin)
* `POST /auth/login` — returns JWT

## Student Flow

* `GET /student/next-item?student_id={id}` — request a recommended item
* `POST /student/submit` — submit answer `{ student_id, item_id, answer, time_taken }`
* `GET /student/profile/{student_id}` — returns mastery profile

## Teacher Flow

* `GET /teacher/class/{class_id}/summary` — aggregated metrics
* `GET /teacher/student/{student_id}/attempts` — attempt history

## Admin / Debug

* `POST /admin/recompute_mastery` — recompute student mastery (for debugging)
* `POST /admin/train_model` — trigger offline training job (background queue)

Full OpenAPI spec is located at `/docs/openapi.yaml` in `services/api-gateway`.

---

# Data & Models

## Data model (simplified)

* `users` — id, role, name, email, created_at
* `items` — id, template_id, tags, difficulty_est, content_hash
* `attempts` — id, student_id, item_id, response, correctness, timestamp, metadata
* `mastery_profiles` — student_id, skill_id, probability_mastery, last_update

## Knowledge Tracer

We provide two tracer implementations for demo purposes:

1. **Bayesian Knowledge Tracing (BKT)** — lightweight, interpretable baseline.
2. **Deep Knowledge Tracing (DKT)** — LSTM-based sequence model implemented in PyTorch used for ablation and research.

Both are implemented under `services/tracker-service/models/` with training scripts and example exports.

## Generative Content Engine

* Prompt engineering templates live in `services/content-service/prompts/`
* Example: `problem_template_math_algebra.json` contains variable placeholders + difficulty parameters
* RAG: content service first looks up top-K similar items from FAISS, then composes a prompt with the retrieved context before calling the LLM (or internal mock generator in offline mode).

---

# Training & Evaluation

A reproducible training pipeline is provided under `services/trainer/`.

### Quick train (demo dataset)

```bash
cd services/trainer
python train_dkt.py --data ../data/demo_attempts.csv --epochs 30 --out models/dkt_demo.pt
```

### Evaluation metrics

* Knowledge tracing: AUC, log-loss, calibration plots
* Item bank: item difficulty RMSE vs true difficulty (simulated ground truth)
* Content quality (LLM): human-rated fluency & relevance scores; automated metrics: BLEU / BERTScore (for template variants)

Sample notebooks demonstrate how to compute each metric and produce visual reports in `notebooks/`.

---

# Teacher Dashboard & UX

Teacher dashboard features:

* Class Overview: average mastery, progress, number of at-risk students
* Student Drilldown: mastery timelines, recent attempts, suggested interventions
* Item Bank: view/edit items and view difficulty estimates
* AB Testing panel: run curriculum variants and compare cohort outcomes

Static prototypes live in `web/teacher/static/` (Figma export + HTML mockups). A lightweight Streamlit dashboard is available for quick demos: `web/teacher/streamlit_demo.py`.

---

# Deployment

We include both Docker and Kubernetes manifests. Key steps:

1. Build images

```bash
make build-images
# or
docker build -t pea-api:dev services/api-gateway
```

2. Publish images (demo)

```bash
docker tag pea-api:dev ghcr.io/fake-org/pea-api:dev
docker push ghcr.io/fake-org/pea-api:dev
```

3. Helm deploy (k8s)

```bash
helm upgrade --install pea infra/k8s/helm/pea --namespace pea --create-namespace
```

4. Verify services

```bash
kubectl get pods -n pea
kubectl port-forward svc/pea-api 8000:80 -n pea
```

---

# CI / CD

GitHub Actions workflows are in `.github/workflows/`:

* `ci/build-and-test.yml` — runs unit tests and lints for Python & JS
* `ci/docker-publish.yml` — builds and publishes images on merge to `main`
* `ci/helm-deploy.yml` — deploys to demo cluster on successful publish

---

# Testing Strategy

* Unit tests for services using `pytest` and `jest` (frontend)
* Integration tests spin up a test Docker Compose environment and run end-to-end flows
* Model regression tests: run a smoke prediction on saved fixtures to detect drift

Run full test suite:

```bash
make test
```

---

# Security & Privacy

* Student-identifiable information is strictly separated and can be pseudonymized for demos.
* All production deployments must use TLS and store secrets in a managed secret store (e.g., Kubernetes Secrets backed by HashiCorp Vault).
* Access control via role-based JWT claims and fine-grained ACL checks in the API gateway.

Note: This demo repo includes mock data only. Never import real student PII into demo or public repos.

---

# Contributing & Roadmap

We keep a small contributor-friendly process for the demo:

* Create tickets in `issues/` and open a PR to `develop`
* All PRs must have at least one reviewer and a passing CI run

Roadmap highlights (fake/demo):

1. Multi-modal tracing (include voice interactions)
2. Self-assessment & reflection prompts
3. Offline curriculum planner and export to LMS (LTI support)

---

# Demo Scripts & Examples

**Simulate a student run:**

```bash
python samples/simulate_students.py --n 50 --policy adaptive
```

**Generate a content sample (local, mock LLM):**

```bash
curl -X POST http://localhost:8001/generate -H "Authorization: Bearer $DEV_KEY" -d '{"skill": "algebra_linear_eq", "difficulty": 0.4 }'
```

**Export teacher report (CSV):**

```bash
python services/api-gateway/scripts/export_teacher_report.py --class-id 101 --out report_class_101.csv
```

---


---

# License

This demo repository is provided for educational and portfolio purposes. Use under the `MIT` license (fake/demo).

---

# Frequently Asked Questions

**Q: Is this production-ready?**
A: This repo is a polished demo intended for portfolio and academic demonstration. Productionizing requires rigorous security, privacy, and assessment validation.

**Q: Can I replace the LLM with an internal model?**
A: Yes — the content-service contains an adapter layer so you can plug external LLM endpoints or local mock generators.

---

# Acknowledgements & References

Project brief and design notes were inspired by an academic project brief (T2.A2) provided with this submission.


