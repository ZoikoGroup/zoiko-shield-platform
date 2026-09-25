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
  description = "Resource ID of the symmetric CMEK that encrypts the evidence bucket at rest. This key does not sign anything."
  value       = google_kms_crypto_key.evidence_cmek.id
}

# The signing keys the services require. Each application variable takes a key
# VERSION resource name, so append /cryptoKeyVersions/<n> to these when wiring
# the environment — the signers validate that shape at construction and refuse
# to start on a crypto key name.
output "anchor_checkpoint_key_id" {
  description = "Crypto key for evidence checkpoint signing. ANCHOR_KMS_KEY_VERSION needs this plus a version suffix."
  value       = google_kms_crypto_key.anchor_checkpoint.id
}

output "evidence_collector_key_id" {
  description = "Crypto key for evidence collector signing. COLLECTOR_KMS_KEY_VERSION needs this plus a version suffix."
  value       = google_kms_crypto_key.evidence_collector.id
}

output "action_command_key_id" {
  description = "Crypto key for governed response command signing. ACTION_COMMAND_KMS_KEY_VERSION needs this plus a version suffix."
  value       = google_kms_crypto_key.action_command.id
}

output "subject_key_wrapping_key_name" {
  description = "Crypto key wrapping per-subject encryption keys. SUBJECT_KEY_KMS_KEY_NAME takes this exactly, with no version suffix."
  value       = google_kms_crypto_key.subject_key_wrapping.id
}

# --- System of record (database.tf)

output "database_instance_connection_name" {
  description = "Cloud SQL connection name (project:region:instance) for the Cloud SQL Auth Proxy / connector"
  value       = google_sql_database_instance.system_of_record.connection_name
}

output "database_private_ip" {
  description = "Private IP of the system-of-record instance; the only address it has"
  value       = google_sql_database_instance.system_of_record.private_ip_address
}

output "database_iam_logins" {
  description = "IAM database login per service role. DATABASE_URL for a service uses its login; MIGRATION_DATABASE_URL uses the migrate login."
  value       = local.database_iam_logins
}

output "database_role_members" {
  description = "Value for DATABASE_ROLE_MEMBERS on the migrate job: service group role -> its IAM login"
  value = jsonencode({
    for role, login in local.database_iam_logins : role => [login] if role != "migrate"
  })
}
