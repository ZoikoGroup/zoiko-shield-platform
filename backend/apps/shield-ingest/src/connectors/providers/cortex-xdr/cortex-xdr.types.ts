/**
 * Palo Alto Cortex XDR Connector Types
 * Standards: OCSF v1.1.0, MITRE ATT&CK v14.1
 */

export interface CortexXdrAlert {
  alert_id: string;
  detector_id: string;
  name: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  event_timestamp: number;
  source: string;
  host_name: string;
  host_ip: string;
  user_name: string;
  action_taken: 'BLOCKED' | 'DETECTED' | 'QUARANTINED';
  mitre_tactic_id_and_name?: string[];
  mitre_technique_id_and_name?: string[];
  causality_actor_process_image_name?: string;
  causality_actor_process_command_line?: string;
  causality_actor_process_sha256?: string;
}

export interface CortexXdrIncident {
  incident_id: string;
  creation_time: number;
  modification_time: number;
  status: 'new' | 'under_investigation' | 'resolved_threat_handled';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  assigned_user_pretty_name?: string;
  alert_count: number;
  hosts: string[];
  users: string[];
  alerts: CortexXdrAlert[];
}

export interface CortexXdrGetIncidentsResponse {
  reply: {
    total_count: number;
    result_count: number;
    incidents: CortexXdrIncident[];
  };
}
