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

# --- Transactional system of record (combined spec §19: managed
# PostgreSQL-compatible relational database) — database.tf

variable "project_data_id" {
  description = "GCP Project ID for the Data boundary (Cloud SQL system of record and its CMEK)"
  type        = string
  default     = "zs-nonprod-data"
}

variable "database_tier" {
  description = "Cloud SQL machine tier for the system-of-record instance"
  type        = string
  default     = "db-custom-2-7680"
}

variable "database_availability_type" {
  description = "ZONAL for non-production; REGIONAL (synchronous standby in a second zone) for production"
  type        = string
  default     = "ZONAL"
  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.database_availability_type)
    error_message = "database_availability_type must be ZONAL or REGIONAL."
  }
}

variable "database_backup_retention_count" {
  description = "Automated daily backups kept; point-in-time recovery covers the log retention window"
  type        = number
  default     = 30
}

variable "database_service_accounts" {
  description = <<-EOT
    Google service account per database service role (prisma/access/access-policy.js).
    Each becomes an IAM database login and a member of its role. Defaults to
    <service>@<runtime project>.iam.gserviceaccount.com; "migrate" is the
    schema-owner job that runs `npm run migrate:deploy`.
  EOT
  type        = map(string)
  default     = {}
}
