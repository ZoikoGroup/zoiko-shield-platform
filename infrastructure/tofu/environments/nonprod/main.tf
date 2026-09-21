# OpenTofu — ZoikoShield Non-Production Environment Deployment (LAB 03 & §8)
# Instantiates a single regional tenant cell for staging and validation

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Regional Cell: Europe-West-3 (Staging / Nonprod Tenant Shard)
# -----------------------------------------------------------------------------
module "cell_nonprod" {
  source = "../../regional-cell"

  environment         = var.environment
  region              = var.region
  project_net_id      = "${var.project_root_id}-net"
  project_runtime_id  = "${var.project_root_id}-runtime"
  project_evidence_id = "${var.project_root_id}-evidence"
  project_security_id = "${var.project_root_id}-security"
}

output "nonprod_gke_cluster" {
  value       = module.cell_nonprod
  description = "Non-Production GKE Regional Cell"
}
