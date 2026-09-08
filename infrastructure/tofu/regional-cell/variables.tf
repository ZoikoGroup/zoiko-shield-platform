# OpenTofu Variable Definitions for ZoikoShield Regional Tenant Cell
# Specification: MASTER_BUILD_PLAN.md §8 (Regional-Cell Foundation)

variable "environment" {
  description = "Deployment environment name (e.g. nonprod, staging, production)"
  type        = string
  default     = "nonprod"
}

variable "region" {
  description = "GCP/Cloud target region for the regional tenant cell (e.g. europe-west3, us-central1)"
  type        = string
  default     = "europe-west3"
}

variable "project_net_id" {
  description = "GCP Project ID for Network boundary (VPC, Cloud Armor, Load Balancer)"
  type        = string
  default     = "zs-nonprod-net"
}

variable "project_runtime_id" {
  description = "GCP Project ID for Runtime workloads (GKE Standard cluster, Workload Identity)"
  type        = string
  default     = "zs-nonprod-runtime"
}

variable "project_evidence_id" {
  description = "GCP Project ID for Evidence Vault (CMEK HSM KeyRing, WORM Object Storage)"
  type        = string
  default     = "zs-nonprod-evidence"
}

variable "project_security_id" {
  description = "GCP Project ID for Security boundary (Secret Manager, Binary Authorization)"
  type        = string
  default     = "zs-nonprod-security"
}

variable "gke_node_count" {
  description = "Initial private worker node count per zone"
  type        = number
  default     = 3
}

variable "evidence_retention_days" {
  description = "Evidence vault immutable WORM object lock retention period in days"
  type        = number
  default     = 2555 # 7-year regulatory retention
}
