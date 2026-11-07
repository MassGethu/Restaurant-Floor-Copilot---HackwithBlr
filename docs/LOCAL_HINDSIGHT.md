# Local Hindsight alongside Cloud

The app defaults to the existing Cloud profile. Select Local explicitly when starting this edition's backend; Cloud URL/key settings in `backend/.env` remain available and unchanged. Both profiles use API port **8001** and dashboard **5174**. Only one backend may use this edition's SQLite database at a time. The original `CV AI for restaurants` folder is never used by this stack.

## Start the Docker memory service

Requires a running Docker daemon and the existing Groq `AGENT_API_KEY` in ignored `backend/.env`:

```sh
cd /Users/massgethu/CV_AI_Hindsight
.venv/bin/python scripts/local_hindsight.py up --wait 60
.venv/bin/python scripts/local_hindsight.py check
```

The first startup downloads the pinned image and local embedding/reranking models. If the check times out during warmup, run `check --wait 60` again. No registration, Docker login, purchase or Cloud token is needed by this local service. The helper supplies the Groq key in the child process environment; it neither prints it nor writes another credentials file. Docker administrators can inspect container credentials, so treat local daemon access as privileged.

- Memory API: <http://127.0.0.1:8888>
- Hindsight control plane: <http://127.0.0.1:9999>
- Status: `.venv/bin/python scripts/local_hindsight.py status`
- Stop memory only: `.venv/bin/python scripts/local_hindsight.py stop`
- Restart memory only: `.venv/bin/python scripts/local_hindsight.py restart --wait 60`

Both published ports bind to loopback. This is a single-user development service without local API authentication; do not expose it to the network. The app's Cloud bearer token is never sent to the Local endpoint.

## Select the app profile

Stop **this edition's backend on 8001** before switching. When using the combined launcher, Ctrl+C stops its backend and dashboard, then run:

```sh
./run_all.sh --memory local
```

To return to Cloud:

```sh
./run_all.sh --memory cloud
```

If the dashboard is already running independently on 5174, restart only the backend:

```sh
cd /Users/massgethu/CV_AI_Hindsight/backend
../.venv/bin/python -m app --memory local
# After stopping that process:
../.venv/bin/python -m app --memory cloud
```

The Supervisor status and Floor advice card identify the selected profile. A busy-port check prevents the CLI from migrating the ledger before discovering another backend on 8001. Do not run two backends against the database through another launcher or port. Starting a backend preserves queue/tasks/logical shifts but requires new camera observations for freshness. Playback **Restart** retains its distinct archive/reset behavior.

`--memory` overrides `HINDSIGHT_PROFILE` for that process. Without either override the default is `cloud`. Local options, all server-side, are:

```dotenv
HINDSIGHT_LOCAL_BASE_URL=http://127.0.0.1:8888
HINDSIGHT_LOCAL_API_KEY=
HINDSIGHT_LOCAL_TIMEOUT_SECONDS=180
HINDSIGHT_LOCAL_LLM_MODEL=openai/gpt-oss-20b
HINDSIGHT_LOCAL_REFLECT_LLM_MODEL=openai/gpt-oss-120b
HINDSIGHT_LOCAL_HANDOVER_MODE=sources
HINDSIGHT_LOCAL_RETAIN_INTERVAL_SECONDS=30
```

Changing the container's model setting takes effect on the next `local_hindsight.py up`. The action reasoner remains the configured `AGENT_MODEL` (default `openai/gpt-oss-120b`). No automatic fallback occurs when either profile fails.

## Data and delivery behavior

`compose.hindsight.yml` creates only the `cv-ai-hindsight` Compose project. Its image is pinned by immutable multi-platform digest; the verified API version is 1.2.0. PostgreSQL/pgvector data and downloaded model cache live in ignored directories inside this edition:

```text
backend/data/hindsight-local/pg0/
backend/data/hindsight-local/cache/
```

A short initialization container sets ownership for the image's UID 1000. Container recreation and `stop` keep these directories. Do not delete them or use volume/prune commands as a routine restart procedure. The service has a 4 GB memory ceiling and 1 GB shared-memory setting; Docker needs spare memory for its other workloads.

SQLite remains authoritative for the floor and original source records. Each source has independent delivery receipts keyed by profile, endpoint and restaurant. First selection of Local queues source records for that destination with their stable document IDs. Local replay is paced at 30 seconds between sends, with a minimum 60-second retry delay and the existing three-attempt bound; controls stay responsive during replay. Returning to Cloud restores its existing receipts and queues only records it has not received. The canonical supersession graph applies immediately, even while replacement records await delivery to a destination. Advice from one destination is never displayed as newly generated advice from the other. An in-place rebuild of a deleted memory database at the **same** URL requires explicit re-delivery; retained receipts cannot detect external data deletion.

This is **local memory storage, embeddings and reranking with hosted inference**. Both Hindsight extraction (`gpt-oss-20b`) and reflection (`gpt-oss-120b`) and action reasoning (`gpt-oss-120b`) still send operational text to Groq. It is not an offline or fully local LLM deployment. Footage is not sent to Hindsight/Groq.

The local configuration uses synchronous retain and raw facts with verifiable sources. Background observation consolidation and its worker are disabled because the app excludes consolidated facts without original document provenance. Strict schemas and Groq `on_demand` service tier are explicit. Cloud bank and model settings are unaffected.

By default, Local handover recalls genuine Hindsight facts and builds a labeled source brief from their verified records, alongside current SQLite tasks. It uses no hosted generation. This is an explicit mode, not an automatic response to a failed provider call. Set `HINDSIGHT_LOCAL_HANDOVER_MODE=reflect` if you want native local Reflect and have enough hosted inference quota. The native mode is bounded, but it still hit request size and token limits on this free-tier account. Cloud handover continues to use native Reflect.

## Run one demo without spending Cloud credits

Use the prepared synthetic scene and its existing six retained sources. On **Floor**, compare the allocator's **T2** with the **T3** Supervisor recommendation under the reported delivery rush. On **Supervisor**, open the correction evidence, then select **Prepare memory-backed briefing**. The Local source brief shows the prior correction, the separately recorded unknown outcome, and current open work. The same advice can propose priority and assignment for the existing cleaning task; approval revalidates each action and changes current state, so refresh before acting on another proposal.

The [single live demo report](verification/hindsight-local-single-demo.json) used actual YOLO on the labeled controlled footage, local Hindsight recall, and a real hosted action recommendation. It verified sourced handover and current tasks, with zero Hindsight Cloud requests and zero new retain calls. The proposed actions remain available for review. This demonstrates the running prototype; it does not establish measured restaurant outcomes.

For a cost-controlled session, launch with `SUPERVISOR_PROACTIVE=false ./run_all.sh --memory local`. This keeps the manual **Generate advice** action and outbox available without automatic model refresh. Reuse valid saved advice and avoid the paired comparison toggle unless you specifically need a second model call. A change in floor, memory or profile can require one fresh recommendation.

## Run the full evaluator only when needed

```sh
.venv/bin/python scripts/evaluate_memory.py --profile local --advice-interval 60
```

This creates an isolated synthetic restaurant/bank and scratch SQLite database, recording inputs, retrieved evidence, responses, versions and failures in `docs/verification/hindsight-local-memory-report.json`. Existing reports are archived before replacement. The Cloud report is kept separately. See [observed local failures and quota limits](verification/hindsight-local-failures.md): the earlier local run passed five pairs and the budgeted source-brief demo now passes; a complete repeated evaluation of the final local configuration was intentionally skipped. Pacing changes request timing, not model prompts or paired inputs. Rate-limit or provider failures remain failures; there is no fake-service fallback.

Local contract tests are in `backend/tests/test_memory_profiles.py`. They use explicit service doubles to check credentials, delivery isolation, round trips, supersession, outages and busy-port protection. They are separate from actual Docker/service evidence in `docs/verification/hindsight-docker-verification.json`.

Primary references: [official installation](https://hindsight.vectorize.io/developer/installation), [configuration](https://hindsight.vectorize.io/developer/configuration), [Python client](https://hindsight.vectorize.io/sdks/python).
