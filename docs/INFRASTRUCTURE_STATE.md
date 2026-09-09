# ZoikoShield Infrastructure State & Regional Cell Provisioning Guide

## 1. Executive Summary
This document records the exact state of infrastructure definitions, backing services, and cloud provisioning boundaries for the ZoikoShield platform.

## 2. Infrastructure Code Inventory

### 2.1 Regional Cell OpenTofu Module (`infrastructure/tofu/regional-cell/`)
- **`main.tf`**:
  - **Network Project**: `google_compute_network` (VPC), `google_compute_subnetwork` (Private GKE subnet with secondary ranges for pods and services).
  - **Runtime Project**: `google_container_cluster` (Regional GKE Standard cluster with private nodes, Workload Identity, and Binary Authorization).
  - **Evidence Project**: `google_kms_key_ring`, `google_kms_crypto_key` (Cloud HSM CMEK with 90-day automatic rotation), `google_storage_bucket` (WORM Evidence Vault with 7-year retention policy and object versioning).
  - **Security Project**: `google_binary_authorization_attestor` (Cosign binary attestation authority).
- **`variables.tf`**: Configures multi-project IDs (`project_net_id`, `project_runtime_id`, `project_evidence_id`, `project_data_id`, `project_security_id`), region (`eu-west-1`), and environment tier.
- **`outputs.tf`**: Exports GKE cluster endpoint, VPC ID, and Evidence Vault KMS Key ARN.

### 2.2 Kubernetes Base Manifests (`infrastructure/k8s/base/shield-services.yaml`)
- Declares Deployments, Services, and ConfigMaps for `shield-core`, `shield-ingest`, `shield-action`, `shield-anchor`, and `shield-ai`.

### 2.3 Observability (`infrastructure/observability/`)
- **`prometheus-rules.yaml`**: Prometheus recording and alerting rules for Golden Signals (latency, errors, traffic, saturation).
- **`grafana-dashboard-golden-signals.json`**: Pre-built Grafana operational dashboard.

---

## 3. Provisioning & Execution Modes

| Dimension | Local / CI Validation Mode | Live Cloud Deployment Mode |
| :--- | :--- | :--- |
| **Backing Services** | `docker-compose.yml` (Postgres 16, Redpanda Kafka, MinIO S3, Redis 7) | Cloud SQL Postgres 16 Multi-AZ, Managed Redpanda / MSK, GCS WORM Vault |
| **Toolchain** | Node.js 20+ / ts-node runtime | OpenTofu v1.8+ / Google Cloud SDK (`gcloud`) |
| **Credentials** | Mocked / Local environment variables | Google Cloud Application Default Credentials (ADC) / Workload Identity |
| **Verification Scope** | 340 test suites, in-process failover, load & offline verifier CLI | Live non-prod regional cell cluster `tofu apply` |

## 4. Phase-0 Exit Proof Boundary
In-process simulations (`npm run simulate:soc`, `npm run simulate:standby-failover`, `npm run simulate:reference-load`, `npm run build:g1-release-bundle`) verify the full cryptographic and distributed system software logic. Live cloud cluster bootstrap occurs during Phase 1 staging deployment using the OpenTofu regional-cell module.
