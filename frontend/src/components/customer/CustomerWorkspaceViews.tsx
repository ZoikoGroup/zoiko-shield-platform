"use client";

import React from "react";
import {
  CustomerSecurityOverviewSection,
  CustomerThreatsIncidentsSection,
  CustomerExposureManagementSection,
  CustomerAssetsInventorySection,
  CustomerVulnerabilitiesSection,
  CustomerDetectionResponseSection,
  CustomerIdentityAccessSection,
} from "./CustomerWorkspaceViewsPart1";
import {
  CustomerDataSecuritySection,
  CustomerCloudSecuritySection,
  CustomerComplianceRiskSection,
  CustomerReportsAnalyticsSection,
  CustomerIntegrationsSection,
  CustomerSettingsSection,
} from "./CustomerWorkspaceViewsPart2";
import { CustomerDashboardView } from "./CustomerDashboardView";

export type CustomerWorkspaceSectionSlug =
  | "dashboard"
  | "security-overview"
  | "threats-incidents"
  | "exposure-management"
  | "assets-inventory"
  | "vulnerabilities"
  | "detection-response"
  | "identity-access"
  | "data-security"
  | "cloud-security"
  | "compliance-risk"
  | "reports-analytics"
  | "integrations"
  | "settings";

export function CustomerWorkspaceSectionRouter({
  section,
}: {
  section: string;
}) {
  switch (section) {
    case "security-overview":
      return <CustomerSecurityOverviewSection />;
    case "threats-incidents":
      return <CustomerThreatsIncidentsSection />;
    case "exposure-management":
      return <CustomerExposureManagementSection />;
    case "assets-inventory":
      return <CustomerAssetsInventorySection />;
    case "vulnerabilities":
      return <CustomerVulnerabilitiesSection />;
    case "detection-response":
      return <CustomerDetectionResponseSection />;
    case "identity-access":
      return <CustomerIdentityAccessSection />;
    case "data-security":
      return <CustomerDataSecuritySection />;
    case "cloud-security":
      return <CustomerCloudSecuritySection />;
    case "compliance-risk":
      return <CustomerComplianceRiskSection />;
    case "reports-analytics":
      return <CustomerReportsAnalyticsSection />;
    case "integrations":
      return <CustomerIntegrationsSection />;
    case "settings":
      return <CustomerSettingsSection />;
    case "dashboard":
    default:
      return <CustomerDashboardView />;
  }
}

export {
  CustomerSecurityOverviewSection,
  CustomerThreatsIncidentsSection,
  CustomerExposureManagementSection,
  CustomerAssetsInventorySection,
  CustomerVulnerabilitiesSection,
  CustomerDetectionResponseSection,
  CustomerIdentityAccessSection,
  CustomerDataSecuritySection,
  CustomerCloudSecuritySection,
  CustomerComplianceRiskSection,
  CustomerReportsAnalyticsSection,
  CustomerIntegrationsSection,
  CustomerSettingsSection,
};

