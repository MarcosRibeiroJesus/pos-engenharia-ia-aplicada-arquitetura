# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AWS Hybrid Recommendation Platform**: A cloud-native e-commerce recommendation engine combining offline batch precomputation with real-time semantic retrieval. The platform orchestrates 11 AWS services (S3, DynamoDB, MemoryDB, SageMaker, ECS, MWAA, Glue, Athena, Lake Formation, CloudWatch, Lambda) to deliver personalized product recommendations within 60ms P95.

**Branch**: `001-aws-recommendation-platform`  
**Status**: Implementation in progress (Phase 1: Local validation, Phase 2: Live AWS integration)

---

## High-Level Architecture

### System Flow (End-to-End Request Processing)

```
User Request → ECS Service (Recommendation Controller)
  ↓
  ├─→ Parallel queries:
  │   ├─→ DynamoDB: Fetch precomputed batch recommendations
  │   └─→ MemoryDB: Query vector index for semantic candidates
  ↓
  Merge & Deduplicate Candidates (tag provenance: batch/realtime/hybrid)
  ↓
  Apply Business Filters (inventory, suppression, recency rules)
  ↓
  SageMaker Endpoint: Score & Re-rank candidates
  ↓
  Return Top-N recommendations with metadata
  ↓
  [Fallback on failures] → Degrade to batch-only or curated defaults
```

### Three-Layer Code Architecture

The serving application (`src/serving/`) uses **Clean Architecture** (Hexagonal) to isolate business logic from AWS infrastructure:

1. **Domain Layer** (`src/serving/src/domain/`): Pure TypeScript entity types and business rules
   - `candidate.ts`: Candidate data model with provenance tracking
   - `filter-rule.ts`: Business eligibility rules (out-of-stock, recency, suppression)
   - `recommendation.ts`: Final ranked recommendation entity

2. **Application Layer** (`src/serving/src/application/`): Orchestration and use cases
   - `get-recommendations.use-case.ts`: Implements the 7-step request flow
   - `candidate-merger.ts`: Deduplicates and merges candidate sets from DynamoDB + MemoryDB
   - `business-filter-engine.ts`: Applies inventory and suppression rules (MUST filter 100% of ineligible items)
   - `reranker.ts`: Combines SageMaker scores with heuristic fallback
   - `heuristic-reranker.ts`: Deterministic re-ranking for degraded mode (when SageMaker unavailable)

3. **Infrastructure Layer** (`src/serving/src/infrastructure/`): AWS SDK clients and adapters
   - `dynamodb/`: Repository pattern for DynamoDB batch recommendations
   - `memorydb/`: ioredis client for MemoryDB vector search (FT.SEARCH HNSW queries)
   - `sagemaker/`: SageMaker Serverless Inference scoring client
   - `resilience/`: Circuit breaker (opossum) for timeout/failure handling
   - `cache/`: LRU cache for inventory eligibility caching
   - `logging/`: Structured JSON logging (pino) with correlation IDs
   - `monitoring/`: CloudWatch metrics emission

4. **Presentation Layer** (`src/serving/src/presentation/`): HTTP API
   - `controllers/recommendation.controller.ts`: Fastify route handlers
   - `server.ts`: Fastify app initialization

**Why This Structure**: Local unit/integration testing can mock all infrastructure adapters without AWS credentials, enabling full validation of the candidate merging, filtering, and fallback logic before cloud deployment. See `tests/` for comprehensive edge-case coverage.

---

## Offline Batch Pipeline Architecture

The batch processing pipeline (`src/batch/`) orchestrates the offline flow:

- **Orchestration** (`src/batch/airflow/`): Amazon MWAA DAGs schedule and sequence all tasks (daily at 02:00 UTC)
- **Data Extraction** (Athena): Materialize curated views from S3 Parquet golden datasets
- **Feature Engineering** (Glue): AWS Glue jobs compute user/item interaction matrices with Job Bookmarks for incremental processing
- **Model Training** (SageMaker): Train collaborative filtering models on Managed Spot instances with checkpointing
- **Publishing** (Glue → DynamoDB & MemoryDB): Batch recommendations to DynamoDB (with 7-day TTL), embeddings to MemoryDB HNSW index

**Key Principle**: All batch artifacts (models, vectors, recommendations) are immutable, versioned, and published to S3 and downstream stores incrementally. The serving layer reads from the latest published snapshots.

---

## Infrastructure as Code (Terraform)

All cloud resources are declaratively defined in `infra/terraform/` using modular Terraform:

- **Modules**: Each AWS service (S3, DynamoDB, MemoryDB, SageMaker, ECS, MWAA, etc.) has a dedicated Terraform module
- **Parameterization**: Cost-driven variables (`enable_serverless_inference`, `environment=poc`, `min_workers`) allow switching between cost-optimized MVP and production configurations
- **Ephemeral Lifecycle**: MWAA, MemoryDB, and SageMaker endpoints configured for automatic creation/teardown to avoid idle compute billing (cost drivers: 71.2% MWAA, 11.5% MemoryDB)
- **GitHub Actions**: CI/CD workflows automate plan/apply/destroy cycles for on-demand validation

---

## Common Development Commands

### Setup & Installation

```bash
# Install root and workspace dependencies
npm install

# (Optional) Start local mock infrastructure for testing
docker run -d -p 8000:8000 --name ddb-local amazon/dynamodb-local
docker run -d -p 6379:6379 --name redis-search redis/redis-stack-server:latest

# Seed local DynamoDB and Redis with mock data
npm run seed:local
```

### Building & Running

```bash
# Compile TypeScript to JavaScript
npm run build

# Run the development server with hot-reload (src/serving)
npm run dev

# Start the compiled server (after build)
npm run start
```

### Testing

```bash
# Run all tests once (unit, integration, contract)
npm test

# Run tests in watch mode (re-run on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

**Test Strategy**: Tests are organized as:
- `tests/unit/`: Domain logic (candidate merging, business rules, scoring)
- `tests/integration/`: Infrastructure adapters with mocked AWS SDKs
- `tests/contract/`: OpenAPI and payload schema validation

All tests use in-memory mocks and local Docker containers; zero AWS credentials required.

### Code Quality

```bash
# Lint TypeScript with ESLint
npm run lint

# Format code with Prettier
npm run format
```

### Specification & Planning (Spec Kit)

The `.agents/skills/speckit-*` system manages specification artifacts:

```bash
# Analyze and clarify requirements (via /speckit-analyze, /speckit-clarify)
# Generate implementation plans (via /speckit-plan)
# Create checklists for acceptance (via /speckit-checklist)
# Convert plans to implementation tasks (via /speckit-tasks)
```

Specifications are stored in `specs/001-aws-recommendation-platform/` with contracts in YAML and JSON formats.

---

## Key Technologies & Design Decisions

### Serving Service (`src/serving/`)

| Component | Choice | Why |
| --- | --- | --- |
| **Framework** | Fastify v4 | Sub-millisecond routing, native schema validation, minimal overhead for latency-critical API |
| **Language** | TypeScript 5.4+ | Type safety for domain and infrastructure layer contracts |
| **Testing** | Vitest + Supertest | Native ESM, fast test runner, familiar assertion library |
| **Resilience** | Opossum circuit breaker | Explicit timeout/fallback patterns for SageMaker and MemoryDB failures |
| **Logging** | Pino structured JSON | Correlation IDs, structured key-value pairs for CloudWatch ingestion |
| **AWS SDK** | AWS SDK v3 | Modular, tree-shakeable; supports ioredis for Redis operations |

### Batch Pipelines (`src/batch/`)

| Component | Choice | Why |
| --- | --- | --- |
| **Orchestration** | MWAA (Apache Airflow) | Fixed in approved architecture; enables scheduled DAG execution with retry logic and task dependency management |
| **ETL** | AWS Glue Spark | Serverless, Job Bookmarks for incremental processing, managed credentials |
| **ML Training** | SageMaker Managed Spot | 70% cost savings vs. On-Demand; checkpointing handles interruptions |
| **Feature Store** | S3 + Glue Catalog | Partitioned Parquet; fine-grained access control via Lake Formation LF-Tags |

### Cost Optimization Posture

The architecture targets **minimum-cost PoC** (~$150–$200/month scheduled, <$25/month ephemeral):

- **SageMaker Endpoint**: Serverless Inference ($0 idle) for MVP; swappable to `ml.t3.medium` for production predictability
- **MemoryDB**: 1 shard, 0 replicas (`db.t4g.small`) in PoC; 128-dim quantized vectors to minimize RAM
- **MWAA**: Parameterized ephemeral teardown; runs only during batch windows (critical: 71.2% of 24/7 cost driver)
- **ECS**: Fargate Spot (80% discount) with auto-scaling down to zero during idle periods
- **DynamoDB**: On-Demand mode (Free Tier covers PoC); no provisioned capacity waste

---

## Critical Specifications & Contracts

**Specification Reference**: [`specs/001-aws-recommendation-platform/spec.md`](./specs/001-aws-recommendation-platform/spec.md)
- 23 features across 5 Epics (Data Foundation, Batch Pipeline, Realtime Infrastructure, Monitoring, Governance)
- Complete 32-point engineering specifications for each feature
- End-to-end success criteria and acceptance scenarios

**Data Model & Contracts**:
- [`specs/001-aws-recommendation-platform/data-model.md`](./specs/001-aws-recommendation-platform/data-model.md): Entity schemas, state transitions
- `specs/001-aws-recommendation-platform/contracts/`:
  - `recommendations-api.yaml`: OpenAPI 3.0 REST API contract
  - `dynamodb-batch-recs-contract.json`: DynamoDB item schema
  - `memorydb-vector-contract.md`: MemoryDB Redis HNSW index structure
  - `sagemaker-inference-contract.json`: SageMaker input/output payloads

**Implementation Plan**: [`specs/001-aws-recommendation-platform/plan.md`](./specs/001-aws-recommendation-platform/plan.md)
- Phased delivery roadmap (Phase 0: Research, Phase 1: Local validation, Phase 2: Live AWS)
- Architecture decisions & cost justifications
- Terraform module mapping

**Quickstart & Validation**: [`specs/001-aws-recommendation-platform/quickstart.md`](./specs/001-aws-recommendation-platform/quickstart.md)
- Local testing workflow (Docker + mock seeds)
- Cloud deployment via Terraform
- End-to-end scenario validation

---

## Fallback & Resilience Design

The platform implements a **5-Level Degradation Matrix** to ensure zero customer-facing 500 errors:

| Scenario | Primary Source | Scoring | Response Provenance | Impact |
| --- | --- | --- | --- | --- |
| **Healthy** | DynamoDB + MemoryDB | SageMaker ML | `hybrid` | Full personalization |
| **SageMaker Timeout (>35ms)** | DynamoDB + MemoryDB | Heuristic (cosine + batch weight) | `hybrid (heuristic)` | Slight relevance trade-off |
| **MemoryDB Down** | DynamoDB only | SageMaker ML | `batch` | Semantic freshness reduced |
| **DynamoDB Down** | MemoryDB only | SageMaker ML | `realtime` | Historical affinity unavailable |
| **Complete Outage** | In-memory fallback | Curated trending | `fallback` | Static high-sellers served |

**Implementation**: Each fallback path is covered by integration tests in `tests/integration/fallback-resilience.test.ts`.

---

## Monorepo Structure & Workspaces

```
.
├── package.json (root: scripts for lint, test, format, build)
├── src/
│   ├── serving/ (workspace)
│   │   ├── src/ (source code)
│   │   ├── Dockerfile (ECS image)
│   │   └── package.json
│   └── batch/ (Python pipelines)
├── infra/terraform/ (Terraform modules & root configs)
├── specs/001-aws-recommendation-platform/ (specification artifacts)
├── tests/ (shared test suites)
└── .github/workflows/ (CI/CD)
```

**Workspace Commands**: The root `package.json` defines scripts that delegate to `src/serving/`:
- `npm run build` → `npm run build --workspace=src/serving` → `tsc`
- `npm run dev` → `npm run dev --workspace=src/serving` → `tsx watch`

---

## Command Output & RTK Configuration

This repository follows **RTK (Concise Command Output)** conventions to optimize token usage and clarity:

- **Command Output**: All tool outputs are condensed to signal and noise-stripped results. Full output is available via `rtk bypass <cmd>` if the condensed result is unusable.
- **Truncation Recovery**: If a command output indicates truncation (e.g., "Showing 100 of 300 matches"), re-run with `rtk bypass` or use Grep/Glob with more specific patterns.
- **Git Operations**: Git status, diffs, and logs are condensed; full history available via `git log --oneline` or `git show <commit>`.

This configuration applies project-wide and is inherited from global `~/.claude/RTK.md`.

---

## Project Memory System

This repository maintains a persistent memory system to preserve context across Claude Code sessions. Memory is stored in:

```
.claude/memory/
├── MEMORY.md (index of all memories)
├── project_architecture.md
├── project_constraints.md
├── aws_integration_status.md
└── [other topic memories]
```

**How Memory Works**:
- Memories persist across future Claude Code sessions in this repository
- Each memory file has a frontmatter header with `name`, `description`, and `type` fields
- MEMORY.md is an index (~150 chars per entry) that gets loaded automatically
- Link related memories with `[[name]]` syntax

**When Claude Updates Memory**:
- Explicit saves: When you ask "remember X" or state important context
- Corrections: When you correct Claude's approach or validate a decision
- Project state: When major architectural decisions, constraints, or status changes occur

---

## Running Validation Scenarios

### Local (In-Memory Mock)

```bash
# 1. Install and seed
npm install
npm run seed:local

# 2. Run tests (all 5 edge cases covered)
npm test

# Expected: Hybrid flow, SageMaker timeout fallback, MemoryDB outage fallback, DynamoDB empty fallback, strict filtering all pass.
```

### Cloud (Ephemeral AWS)

```bash
cd infra/terraform

# 1. Plan and apply
terraform init
terraform plan -var="environment=poc" -var="enable_serverless_inference=true"
terraform apply -auto-approve -var="environment=poc"

# 2. Validate via curl
curl "http://<ALB-DNS>/v1/recommendations?userId=u-12345&limit=10"

# 3. Tear down (MANDATORY to avoid idle costs)
terraform destroy -auto-approve
```

---

## Important Constraints & Principles

1. **Fixed Architecture**: The 11-service AWS architecture is FIXED. No components may be replaced, merged, or removed.
2. **100% Filter Compliance**: Out-of-stock and recently purchased items MUST be filtered 100%; zero ineligible items leak to users.
3. **Deterministic Fallback**: On any downstream component outage, the platform degrades to batch or curated fallback WITHOUT raising 500 errors.
4. **Cost Discipline**: Parameterized Terraform enforces minimum-cost PoC posture; high-cost components (MWAA 71.2%, MemoryDB 11.5%) configured for ephemeral lifecycle.
5. **Test-First Proof**: All 5 operational edge cases must be validated by automated tests before code merges.

---

## Development Workflow

1. **Understand the Spec**: Read `specs/001-aws-recommendation-platform/spec.md` for the feature you're implementing.
2. **Write Tests First**: Add test cases in `tests/` covering both happy path and edge cases (use mock adapters, no AWS credentials).
3. **Implement in Clean Architecture Layers**: Domain logic → Application orchestration → Infrastructure adapters → Presentation controllers.
4. **Validate Contracts**: Ensure data flowing through your code conforms to contracts in `specs/001-aws-recommendation-platform/contracts/`.
5. **Run Full Test Suite**: `npm test` must pass with 100% filter compliance and all 5 fallback scenarios verified.
6. **Lint & Format**: `npm run lint` and `npm run format` before committing.

---

## Useful Pointers

- **Specification Gaps**: Found an ambiguity in the spec? Raise it in the spec itself or create a task via `/speckit-clarify`.
- **Test Coverage**: Check `tests/` for edge-case examples; patterns mirror the 5-level resilience matrix.
- **Local Development Loop**: `npm run dev` watches `src/serving/src/` and hot-reloads. Use mock adapters to avoid AWS SDK errors.
- **Logging & Debugging**: Pino logs are structured JSON. For development, use `DEBUG=*` env var or Pino Pretty (`pino-pretty`) for readable output.
- **Terraform Troubleshooting**: Check `infra/terraform/terraform.tfvars.example` for required variable setup.

