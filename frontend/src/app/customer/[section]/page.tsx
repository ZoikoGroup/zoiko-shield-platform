"use client";

import React from "react";
import { useParams } from "next/navigation";
import { CustomerWorkspaceSectionRouter } from "@/components/customer/CustomerWorkspaceViews";

export default function CustomerSectionPage() {
  const params = useParams();
  const rawSection = params?.section;
  const section = Array.isArray(rawSection)
    ? rawSection[0]
    : rawSection || "dashboard";

  return <CustomerWorkspaceSectionRouter section={section} />;
}

