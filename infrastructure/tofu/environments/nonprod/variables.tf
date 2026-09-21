# OpenTofu Variable Definitions for ZoikoShield Non-Production Environment
# Specification: MASTER_BUILD_PLAN.md §8 (Regional-Cell Foundation)

variable "project_root_id" {
  type        = string
  description = "Parent GCP Organization / Folder Project ID for Non-Production"
  default     = "zoikoshield-nonprod-root"
}

variable "region" {
  type        = string
  description = "Primary GCP Region for Non-Production Tenant Cell"
  default     = "europe-west3"
}

variable "environment" {
  type        = string
  description = "Environment Name"
  default     = "nonprod"
}
