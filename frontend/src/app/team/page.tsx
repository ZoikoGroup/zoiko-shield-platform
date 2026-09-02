"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Modal } from "@/ui/Modal";
import {
  Users,
  UserPlus,
  Mail,
  CheckCircle2,
  Clock,
  Shield,
  ArrowRight,
  UserCheck,
  Sparkles,
} from "lucide-react";

export default function TeamPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [email, setEmail] = useState("analyst.ops@acme.com");
  const [role, setRole] = useState<"SECURITY_ANALYST" | "AUDITOR" | "TENANT_ADMIN">("SECURITY_ANALYST");
  const [isLoading, setIsLoading] = useState(false);
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await ZoikoShieldApiClient.inviteAnalyst(
        state.tenant.id,
        email,
        role
      );
      setIsInviteModalOpen(false);
      setEmail("analyst.ops@acme.com");
    } catch (err) {
      console.error("Invite Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptInviteAsInvitee = async (inv: any) => {
    setAcceptingToken(inv.token);
    try {
      // 1. Authenticate identity as the invited user per @CurrentUser() requirement on shield-core
      await ZoikoShieldApiClient.login(inv.invitedEmail, "demo-password");
      // 2. Accept the invitation
      await ZoikoShieldApiClient.acceptInvitation(inv.token);
    } catch (err) {
      console.error("Accept Invitation Error:", err);
    } finally {
      setAcceptingToken(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="pass">ERB-01 STEP 3</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              IDENTITY & ROLE-BASED ACCESS CONTROL
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Security Team & Invitations
          </h1>
          <p className="text-sm text-slate-400">
            Issue tenant-scoped invitations, switch to invited identity (`@CurrentUser()`), and accept membership.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => setIsInviteModalOpen(true)}>
            <UserPlus className="w-4 h-4" />
            <span>Invite Security Analyst</span>
          </Button>
          <Button variant="cyan" onClick={() => router.push("/connectors")}>
            <span>Proceed to Connectors</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Active Team Members */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            Active Team Members ({state.team.length})
          </h3>
          <span className="text-xs font-mono text-slate-400">
            Tenant: {state.tenant.id}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 uppercase border-b border-slate-800">
              <tr>
                <th className="p-3">Analyst / Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">RBAC Role</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {state.team.map((member, idx) => (
                <tr key={member.id || member.email || idx} className="hover:bg-slate-900/40">
                  <td className="p-3 font-sans font-semibold text-slate-200 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-mono">
                      {member.fullName.charAt(0)}
                    </div>
                    {member.fullName}
                  </td>
                  <td className="p-3 text-slate-300">{member.email}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                      {member.role}
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge variant="healthy">ACTIVE</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pending Invitations */}
      {state.invitations.length > 0 && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Pending Invitations ({state.invitations.length})
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Backend Requirement: Invitee must authenticate before accepting
            </span>
          </div>

          <div className="space-y-2">
            {state.invitations.map((inv, idx) => (
              <div
                key={inv.id || inv.token || idx}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono"
              >
                <div>
                  <span className="text-slate-200 font-semibold">{inv.invitedEmail}</span>
                  <span className="text-slate-500 ml-2">({inv.assignedRole})</span>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Token: {inv.token}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={inv.status === "ACCEPTED" ? "pass" : "pending"}>
                    {inv.status}
                  </Badge>

                  {inv.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="cyan"
                      isLoading={acceptingToken === inv.token}
                      onClick={() => handleAcceptInviteAsInvitee(inv)}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Switch to Invitee & Accept</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Security Analyst"
        description="Issue role-scoped membership invitation to the tenant via POST /api/v1/tenants/:tenantId/invitations."
      >
        <form onSubmit={handleSendInvite} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">
              Invited Analyst Email:
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="analyst.ops@acme.com"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">
              Assigned Role:
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            >
              <option value="SECURITY_ANALYST">
                SECURITY_ANALYST (Triage & Response)
              </option>
              <option value="AUDITOR">AUDITOR (Read-Only Evidence)</option>
              <option value="TENANT_ADMIN">TENANT_ADMIN (Full Admin)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsInviteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isLoading}>
              <Mail className="w-4 h-4" />
              <span>Send Invitation</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
