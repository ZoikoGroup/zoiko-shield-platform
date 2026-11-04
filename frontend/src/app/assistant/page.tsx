import type { Metadata } from "next";
import { AssistantHome } from "@/components/public-assistant/AssistantHome";

export const metadata: Metadata = {
  title: "ZoikoShield AI Assistant — Public information",
  description:
    "Ask the ZoikoShield AI Assistant about detection, investigation, integrations, compliance and plans. Answers use approved public content.",
};

export default function AssistantPage() {
  return <AssistantHome />;
}
