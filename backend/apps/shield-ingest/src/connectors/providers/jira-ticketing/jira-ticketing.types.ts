export interface JiraIssuePayload {
  id: string;
  key: string;
  summary: string;
  description?: string;
  issue_type: 'Incident' | 'Security Finding' | 'Task' | 'Bug';
  priority: 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  assignee_email?: string;
  reporter_email?: string;
  created: string;
  updated?: string;
  project_key: string;
}

export interface OcsfIncidentFindingEvent {
  metadata: {
    version: string;
    product: {
      vendor_name: string;
      name: string;
      version?: string;
    };
  };
  category_uid: number; // 2: Findings
  class_uid: number; // 2001: Security Finding / Incident
  activity_id: number;
  severity_id: number;
  severity: string;
  time: string;
  tenant_id: string;
  environment_id: string;
  region: string;
  finding_info: {
    title: string;
    uid: string;
    src_url?: string;
    desc?: string;
    types?: string[];
  };
  status: string;
  raw_payload_hash: string;
}
