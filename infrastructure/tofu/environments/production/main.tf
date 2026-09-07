# OpenTofu — ZoikoShield Production Multi-Region Deployment (Month 3 / LAB 16 & 18)
# Instantiates active-active regional cells across us-east-1 and eu-central-1

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30.0"
    }
  }
}

variable "project_root_id" {
  type        = string
  description = "Parent GCP Organization / Folder Project ID"
  default     = "zoikoshield-prod-root"
}

# -----------------------------------------------------------------------------
# Regional Cell 1: US-East-1 (Primary North America Tenant Shard)
# -----------------------------------------------------------------------------
module "cell_us_east_1" {
  source = "../../regional-cell"

  environment         = "production"
  region              = "us-east1"
  project_net_id      = "${var.project_root_id}-us-net"
  project_runtime_id  = "${var.project_root_id}-us-runtime"
  project_evidence_id = "${var.project_root_id}-us-evidence"
}

# -----------------------------------------------------------------------------
# Regional Cell 2: EU-Central-1 (Sovereign European Tenant Shard — GDPR Fenced)
# -----------------------------------------------------------------------------
module "cell_eu_central_1" {
  source = "../../regional-cell"

  environment         = "production"
  region              = "europe-west3" # Frankfurt / EU-Central
  project_net_id      = "${var.project_root_id}-eu-net"
  project_runtime_id  = "${var.project_root_id}-eu-runtime"
  project_evidence_id = "${var.project_root_id}-eu-evidence"
}

# -----------------------------------------------------------------------------
# Global Cloud Armor & Multi-Region Anycast Health Check
# -----------------------------------------------------------------------------
resource "google_compute_security_policy" "edge_waf_policy" {
  name        = "zs-prod-edge-armor-policy"
  description = "Edge WAF policy enforcing rate limits and geo-fencing"
  project     = "${var.project_root_id}-us-net"

  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default permit rule with upstream Cedar re-authorization"
  }

  rule {
    action   = "rate_based_ban"
    priority = "1000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 5000
        interval_sec = 60
      }
    }
    description = "Volumetric DDoS rate-limiting at edge ingress"
  }
}

output "us_east_gke_cluster" {
  value       = module.cell_us_east_1
  description = "US East GKE Regional Cell"
}

output "eu_central_gke_cluster" {
  value       = module.cell_eu_central_1
  description = "EU Central GKE Sovereign Regional Cell"
}
