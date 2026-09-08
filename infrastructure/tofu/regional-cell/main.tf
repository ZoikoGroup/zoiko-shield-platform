# OpenTofu — ZoikoShield Regional Tenant Cell Foundation (LAB 03 & Section 9)
# Multi-project isolation split: net, runtime, data, evidence, security, build

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30.0"
    }
  }
}

# 1. Network Project: VPC, Cloud Armor, Load Balancer
resource "google_compute_network" "regional_vpc" {
  name                    = "zs-${var.environment}-vpc-${var.region}"
  auto_create_subnetworks = false
  project                 = var.project_net_id
}

resource "google_compute_subnetwork" "gke_subnet" {
  name                     = "zs-${var.environment}-gke-subnet"
  ip_cidr_range            = "10.10.0.0/20"
  region                   = var.region
  network                  = google_compute_network.regional_vpc.id
  private_ip_google_access = true
  project                  = var.project_net_id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.20.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.30.0.0/20"
  }
}

# 2. Runtime Project: Regional GKE Standard Cluster with Private Nodes & Workload Identity
resource "google_container_cluster" "regional_gke" {
  name     = "zs-${var.environment}-gke-${var.region}"
  location = var.region
  project  = var.project_runtime_id

  network    = google_compute_network.regional_vpc.id
  subnetwork = google_compute_subnetwork.gke_subnet.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  workload_identity_config {
    workload_pool = "${var.project_runtime_id}.svc.id.goog"
  }

  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }
}

# 3. Evidence Project: Dedicated Evidence Bucket with Object Retention & Tenant CMEK
resource "google_kms_key_ring" "evidence_keyring" {
  name     = "zs-${var.environment}-evidence-kr"
  location = var.region
  project  = var.project_evidence_id
}

resource "google_kms_crypto_key" "evidence_cmek" {
  name            = "zs-evidence-vault-key"
  key_ring        = google_kms_key_ring.evidence_keyring.id
  rotation_period = "7776000s" # 90 days

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "HSM" # Hardware Security Module (LAB 11)
  }
}

resource "google_storage_bucket" "evidence_vault" {
  name          = "zs-${var.environment}-evidence-vault-${var.region}"
  location      = var.region
  project       = var.project_evidence_id
  force_destroy = false

  uniform_bucket_level_access = true
  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.evidence_cmek.id
  }

    retention_policy {
    is_locked        = false # Keep unlocked during staging; permanent lock applied at GA
    retention_period = 220752000 # 7 years in seconds (2555 days)
  }
}

# 4. Security Project: Binary Authorization Attestor & Supply Chain Signing Keys (LAB 17)
resource "google_binary_authorization_attestor" "cosign_attestor" {
  name    = "zs-${var.environment}-cosign-attestor"
  project = var.project_security_id

  attestation_authority_note {
    note_reference = "projects/${var.project_security_id}/notes/zs-cosign-authority"
  }
}

