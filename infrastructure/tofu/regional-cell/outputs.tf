# OpenTofu Output Definitions for ZoikoShield Regional Tenant Cell
# Specification: MASTER_BUILD_PLAN.md §8 (Regional-Cell Foundation)

output "regional_vpc_id" {
  description = "The URI of the Regional Tenant VPC Network"
  value       = google_compute_network.regional_vpc.id
}

output "gke_cluster_name" {
  description = "The name of the Regional GKE Standard Cluster"
  value       = google_container_cluster.regional_gke.name
}

output "gke_cluster_endpoint" {
  description = "The internal IP endpoint of the GKE master API"
  value       = google_container_cluster.regional_gke.endpoint
  sensitive   = true
}

output "evidence_vault_bucket" {
  description = "The name of the CMEK-encrypted WORM Evidence Vault bucket"
  value       = google_storage_bucket.evidence_vault.name
}

output "evidence_cmek_key_id" {
  description = "The Resource ID of the Cloud HSM Evidence Signing Key"
  value       = google_kms_crypto_key.evidence_cmek.id
}
