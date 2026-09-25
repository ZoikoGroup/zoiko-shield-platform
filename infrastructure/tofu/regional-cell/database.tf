# 5. Data Project: transactional system of record
#
# ZoikoShield combined engineering spec §19: "Managed PostgreSQL-compatible
# relational database" holding authoritative tenant, commercial, case, control,
# policy and ledger metadata, with module schemas and row/tenant controls.
# §11.1 and §15: one schema per module, tenant row-level security, restricted
# bypass. Schemas, grants and row policies are applied by the application's
# migrate job (backend/prisma/access/access-policy.js), not here: this file
# provides the instance, its encryption, recovery, network and identities.

locals {
  database_services = {
    shield_core_app   = "shield-core"
    shield_ingest_app = "shield-ingest"
    shield_ai_app     = "shield-ai"
    shield_action_app = "shield-action"
    shield_anchor_app = "shield-anchor"
    migrate           = "shield-migrate"
  }
  database_service_accounts = {
    for role, name in local.database_services :
    role => lookup(var.database_service_accounts, role, "${name}@${var.project_runtime_id}.iam.gserviceaccount.com")
  }
  # Cloud SQL names an IAM service-account login without its domain suffix.
  database_iam_logins = {
    for role, email in local.database_service_accounts :
    role => trimsuffix(email, ".gserviceaccount.com")
  }
}

data "google_project" "data" {
  project_id = var.project_data_id
}

# Private services access: the instance has no public address and is reached
# over the regional VPC (spec §25 "private endpoints ... no public data-service
# access").
resource "google_compute_global_address" "database_peering_range" {
  name          = "zs-${var.environment}-sql-peering-${var.region}"
  project       = var.project_net_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.regional_vpc.id
}

resource "google_service_networking_connection" "database_private_access" {
  network                 = google_compute_network.regional_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.database_peering_range.name]
}

# CMEK for the database, in its own key ring beside the data it protects.
resource "google_kms_key_ring" "database_keyring" {
  name     = "zs-${var.environment}-database-kr"
  location = var.region
  project  = var.project_data_id
}

resource "google_kms_crypto_key" "database_cmek" {
  name            = "zs-system-of-record-key"
  key_ring        = google_kms_key_ring.database_keyring.id
  rotation_period = "7776000s" # 90 days

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "HSM"
  }
}

resource "google_kms_crypto_key_iam_member" "database_cmek_cloudsql" {
  crypto_key_id = google_kms_crypto_key.database_cmek.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.data.number}@gcp-sa-cloud-sql.iam.gserviceaccount.com"
}

resource "google_sql_database_instance" "system_of_record" {
  name                = "zs-${var.environment}-sor-${var.region}"
  project             = var.project_data_id
  region              = var.region
  database_version    = "POSTGRES_16"
  encryption_key_name = google_kms_crypto_key.database_cmek.id
  deletion_protection = true

  depends_on = [
    google_service_networking_connection.database_private_access,
    google_kms_crypto_key_iam_member.database_cmek_cloudsql,
  ]

  settings {
    tier              = var.database_tier
    edition           = "ENTERPRISE"
    availability_type = var.database_availability_type
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.regional_vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    # Spec §11.1: every physical store declares backup, restore and integrity
    # behaviour. Point-in-time recovery over the retained write-ahead log;
    # restores are rehearsed by the application's restore drill.
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      start_time                     = "02:00"
      location                       = var.region # backups stay in the cell's region (residency, spec §15.1)

      backup_retention_settings {
        retained_backups = var.database_backup_retention_count
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 3
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = true
      record_client_address   = false
    }

    # IAM database authentication: services log in as their Google service
    # accounts, so no database password exists to leak or rotate.
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    # Audit role and schema changes, including grants and row-policy changes
    # made by the access-policy step (spec §25: privilege grants and
    # configuration changes feed independent security audit).
    database_flags {
      name  = "cloudsql.enable_pgaudit"
      value = "on"
    }
    database_flags {
      name  = "pgaudit.log"
      value = "ddl,role"
    }
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
  }
}

resource "google_sql_database" "shield_core" {
  name     = "shield_core"
  project  = var.project_data_id
  instance = google_sql_database_instance.system_of_record.name
}

# One IAM login per service. Privileges come from the service's group role,
# granted by the migrate job through DATABASE_ROLE_MEMBERS (output below).
resource "google_sql_user" "service" {
  for_each = local.database_service_accounts

  name     = local.database_iam_logins[each.key]
  project  = var.project_data_id
  instance = google_sql_database_instance.system_of_record.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_project_iam_member" "database_client" {
  for_each = local.database_service_accounts

  project = var.project_data_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${each.value}"
}

resource "google_project_iam_member" "database_instance_user" {
  for_each = local.database_service_accounts

  project = var.project_data_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${each.value}"
}
