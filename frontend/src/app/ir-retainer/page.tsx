"use client";

import React, { useState, useEffect } from "react";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  IncidentResponseRetainer,
  IncidentWorkOrder,
  WorkOrderConsumptionRecord,
  IncidentLegalSensitiveRecord,
} from "@/lib/types";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  PhoneCall,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Lock,
  Plus,
  ArrowRight,
  TrendingUp,
  UserCheck,
  KeyRound,
  FileCheck,
  Scale,
  RefreshCw,
} from "lucide-react";
import {
  LoadingState,
  DegradedState,
  StaleState,
} from "@/components/states/mandatory-ui-states";

export default function IrRetainerPage() {
  const [state] = useDemoState();
  const [retainers, setRetainers] = useState<IncidentResponseRetainer[]>([]);
  const [workOrders, setWorkOrders] = useState<IncidentWorkOrder[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<IncidentWorkOrder | null>(null);
  const [consumptionList, setConsumptionList] = useState<WorkOrderConsumptionRecord[]>([]);
  const [legalRecords, setLegalRecords] = useState<IncidentLegalSensitiveRecord[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isDegraded, setIsDegraded] = useState(false);
  const [isStale, setIsStale] = useState(false);

  // Modals
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [isLogHoursModalOpen, setIsLogHoursModalOpen] = useState(false);
  const [isLegalRecordModalOpen, setIsLegalRecordModalOpen] = useState(false);

  // Form states
  const [activationForm, setActivationForm] = useState({
    incidentReference: "INC-2026-9021",
    activationReason: "Suspected Cobalt Strike Beacon on Domain Controller",
    activationReference: "HOTLINE-AUTH-0912",
    responseAuthority: "R2" as "R0" | "R1" | "R2" | "R3" | "R4",
    readinessEvidenceRefs: "evidence://vault/auth-log-01, evidence://vault/network-capture-02",
    customerContact: "Sarah Chen (Lead Analyst)",
  });

  const [logHoursForm, setLogHoursForm] = useState({
    hours: 4,
    workDescription: "Deep memory forensics, process tree extraction, and C2 firewall rule deployment",
    evidenceReference: "evidence://vault/forensic-memory-dump-02",
  });

  const [legalAccessReason, setLegalAccessReason] = useState("REGULATORY_INQUIRY");
  const [legalForm, setLegalForm] = useState({
    purpose: "REGULATOR_INQUIRY" as const,
    privilegeStatus: "NO_PRIVILEGE_CLAIMED" as const,
    notificationStatus: "NOT_APPLICABLE" as const,
    contentReference: "evidence://vault/factual-forensic-report-v1",
    accessReason: "Preparation for statutory regulatory inquiry filing",
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rets, wos] = await Promise.all([
        ZoikoShieldApiClient.getIncidentRetainers(),
        ZoikoShieldApiClient.getIncidentWorkOrders(),
      ]);
      setRetainers(rets);
      setWorkOrders(wos);
      if (wos.length > 0 && !selectedWorkOrder) {
        setSelectedWorkOrder(wos[0]);
      }
      setIsDegraded(false);
      setIsStale(false);
    } catch {
      setIsDegraded(true);
      setIsStale(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [state.incidentRetainers, state.incidentWorkOrders]);

  useEffect(() => {
    if (selectedWorkOrder) {
      ZoikoShieldApiClient.getWorkOrderConsumption(selectedWorkOrder.id).then(setConsumptionList);
      ZoikoShieldApiClient.listLegalSensitiveRecords(selectedWorkOrder.id, legalAccessReason).then(
        setLegalRecords
      );
    }
  }, [selectedWorkOrder, legalAccessReason, state.workOrderConsumption, state.legalSensitiveRecords]);

  const activeRetainer = retainers[0] || state.incidentRetainers?.[0];
  const includedHours = activeRetainer?.includedHours || 40;
  const consumedHours = activeRetainer?.consumedHours || 0;
  const remainingHours = activeRetainer?.remainingHours ?? Math.max(0, includedHours - consumedHours);
  const consumptionPercent = Math.min(100, Math.round((consumedHours / includedHours) * 100));

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRetainer) return;
    try {
      const created = await ZoikoShieldApiClient.activateWorkOrder({
        retainerId: activeRetainer.id,
        incidentReference: activationForm.incidentReference,
        activationReason: activationForm.activationReason,
        activationReference: activationForm.activationReference,
        responseAuthority: activationForm.responseAuthority,
        readinessEvidenceRefs: activationForm.readinessEvidenceRefs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        customerContact: activationForm.customerContact,
      });
      setIsActivateModalOpen(false);
      setSelectedWorkOrder(created);
      await loadData();
    } catch (err) {
      console.error("Activation failed:", err);
    }
  };

  const handleLogHoursSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkOrder) return;
    try {
      await ZoikoShieldApiClient.logWorkOrderHours(selectedWorkOrder.id, {
        hours: Number(logHoursForm.hours),
        workDescription: logHoursForm.workDescription,
        evidenceReference: logHoursForm.evidenceReference,
      });
      setIsLogHoursModalOpen(false);
      await loadData();
      if (selectedWorkOrder) {
        const updatedConsumption = await ZoikoShieldApiClient.getWorkOrderConsumption(selectedWorkOrder.id);
        setConsumptionList(updatedConsumption);
      }
    } catch (err) {
      console.error("Log hours failed:", err);
    }
  };

  const handleCreateLegalRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkOrder) return;
    try {
      await ZoikoShieldApiClient.createLegalSensitiveRecord({
        workOrderId: selectedWorkOrder.id,
        purpose: legalForm.purpose,
        privilegeStatus: legalForm.privilegeStatus,
        notificationStatus: legalForm.notificationStatus,
        counselControlled: false,
        contentReference: legalForm.contentReference,
        accessReason: legalForm.accessReason,
      });
      setIsLegalRecordModalOpen(false);
      const updatedLegal = await ZoikoShieldApiClient.listLegalSensitiveRecords(
        selectedWorkOrder.id,
        legalAccessReason
      );
      setLegalRecords(updatedLegal);
    } catch (err) {
      console.error("Create legal record failed:", err);
    }
  };

  if (isLoading) {
    return <LoadingState message="Connecting to Commercial Retainer Ledger & 24x7 SLA Engine..." />;
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Degraded / Stale state alerts */}
      {isDegraded && (
        <DegradedState
          message="Operating in cached ledger mode. Live SLA verification updates may be delayed."
          fallbackReason="IR_LEDGER_OFFLINE_CACHE_ACTIVE"
          retryAction={loadData}
        />
      )}
      {isStale && !isDegraded && <StaleState retryAction={loadData} />}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <PhoneCall className="w-6 h-6 text-cyan-400" />
              Incident Response Retainer & SLA Engine
            </h1>
            <Badge variant="active">ACTIVE ANNUAL TERM</Badge>
            <Badge variant="anchored">§16.4 SPECIFICATION</Badge>
          </div>
          <p className="text-sm text-slate-400">
            Ground-truth commercial hour ledger, 24x7 SLA response commitments, and purpose-bound legal-sensitive records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setIsActivateModalOpen(true)}
            className="gap-2 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
          >
            <Shield className="w-4 h-4" /> Activate Emergency Work Order
          </Button>
        </div>
      </div>

      {/* Grid 1: Retainer Summary, Response SLA, Readiness Obligations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Retainer Term & Hour Ledger */}
        <Card className="p-6 bg-slate-900/60 border-slate-800 backdrop-blur-md relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-xs font-mono font-medium text-cyan-400 uppercase tracking-wider">
                Annual Term (365 Days)
              </span>
              <h3 className="text-lg font-bold text-white mt-1">Included Hours Ledger</h3>
            </div>
            <Badge variant="active">{activeRetainer?.status || "ACTIVE"}</Badge>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-400">Balance Status</span>
                <span className="font-mono text-white font-semibold">
                  {remainingHours}h remaining / {includedHours}h total
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700/50">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    consumptionPercent >= 80 ? "bg-amber-500" : "bg-cyan-500"
                  }`}
                  style={{ width: `${consumptionPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-1">
                <span>Consumed: {consumedHours}h ({consumptionPercent}%)</span>
                <span>Warning Threshold: {activeRetainer?.warningThresholdPercent || 80}%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div>
                <span className="text-slate-500 block">Overage Policy</span>
                <span className="font-mono text-slate-300 font-medium">
                  {activeRetainer?.overagePolicy || "REQUIRE_APPROVAL"} (Cap: {activeRetainer?.overageCapHours || 20}h @ ${activeRetainer?.overageRate || 350}/h)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Rollover Policy</span>
                <span className="font-mono text-slate-300 font-medium">
                  {activeRetainer?.rolloverPolicy || "CAPPED"} (Max: {activeRetainer?.rolloverCapHours || 10}h)
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* 24x7 Response Window & SLA */}
        <Card className="p-6 bg-slate-900/60 border-slate-800 backdrop-blur-md">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-xs font-mono font-medium text-emerald-400 uppercase tracking-wider">
                Response Window Guarantee
              </span>
              <h3 className="text-lg font-bold text-white mt-1">24x7 Emergency SLA</h3>
            </div>
            <Clock className="w-5 h-5 text-emerald-400" />
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> SLA Acknowledgement
              </span>
              <span className="font-mono text-emerald-300 font-bold">
                &lt; {activeRetainer?.responseWindow?.acknowledgementTargetMinutes || 30} mins
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Incident Activation Target
              </span>
              <span className="font-mono text-emerald-300 font-bold">
                &lt; {activeRetainer?.responseWindow?.activationResponseMinutes || 60} mins
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
              <span className="text-slate-400 flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" /> Max Response Authority
              </span>
              <Badge variant="neutral">{activeRetainer?.maximumResponseAuthority || "R2"} (Containment)</Badge>
            </div>
          </div>
        </Card>

        {/* Readiness Obligations (§16.4) */}
        <Card className="p-6 bg-slate-900/60 border-slate-800 backdrop-blur-md">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-xs font-mono font-medium text-amber-400 uppercase tracking-wider">
                Readiness Obligations
              </span>
              <h3 className="text-lg font-bold text-white mt-1">Pre-Authorized Scope</h3>
            </div>
            <UserCheck className="w-5 h-5 text-amber-400" />
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" /> Named Contacts
              </span>
              <span className="font-mono text-slate-300">
                {activeRetainer?.readinessObligations?.namedContacts?.contacts?.join(", ") || "Sarah Chen, CISO"}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400 flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" /> Access & Credential Escrow
              </span>
              <span className="font-mono text-emerald-400">VERIFIED</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-purple-400" /> Evidence Preservation
              </span>
              <span className="font-mono text-emerald-400">ACTIVE WORM</span>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Excluded Services
              </span>
              <span className="font-mono text-slate-400 text-[11px]">
                No Routine IT / No Uncontracted Legal Advice
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Grid 2: Incident Work Orders & Itemized Consumption Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Work Orders List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              Incident Work Orders
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {workOrders.length} Activated Work Orders
            </span>
          </div>

          <div className="space-y-3">
            {workOrders.map((wo) => {
              const isSelected = selectedWorkOrder?.id === wo.id;
              return (
                <div
                  key={wo.id}
                  onClick={() => setSelectedWorkOrder(wo)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-800/80 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-cyan-300">
                        {wo.incidentReference}
                      </span>
                      <Badge variant={wo.status === "ACTIVE" ? "critical" : "neutral"}>
                        {wo.status}
                      </Badge>
                      <Badge variant="neutral">{wo.responseAuthority}</Badge>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      Consumed: <strong className="text-white">{wo.consumedHours}h</strong> / {wo.includedHours}h
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mb-3">{wo.activationReason}</p>

                  <div className="flex justify-between items-center text-[11px] font-mono text-slate-500 pt-2 border-t border-slate-800/60">
                    <span>Ref: {wo.activationReference}</span>
                    <span>Contact: {wo.customerContact || "Lead Analyst"}</span>
                    <span className="text-cyan-400 flex items-center gap-1 font-sans">
                      Select Work Order <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Itemized Consumption Ledger (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Consumption Ledger
            </h3>
            {selectedWorkOrder && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsLogHoursModalOpen(true)}
                className="gap-1.5 text-xs h-7"
              >
                <Plus className="w-3.5 h-3.5" /> Log Hours
              </Button>
            )}
          </div>

          <Card className="p-4 bg-slate-900/60 border-slate-800 backdrop-blur-md min-h-[300px]">
            {selectedWorkOrder ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800 text-xs text-slate-400">
                  <span>Work Order: <strong className="text-white font-mono">{selectedWorkOrder.incidentReference}</strong></span>
                  <span className="font-mono text-cyan-300">{selectedWorkOrder.consumedHours}h Total Logged</span>
                </div>

                {consumptionList.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    No consumption logged against this work order yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {consumptionList.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-lg bg-slate-800/40 border border-slate-800/80 text-xs space-y-1.5"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-bold text-emerald-400">+{c.hours} Hours</span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {new Date(c.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-slate-300 text-xs">{c.workDescription}</p>
                        <div className="text-[10px] font-mono text-cyan-400/80 truncate">
                          Evidence Ref: {c.evidenceReference}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-12 text-center">
                Select a work order to view itemized consumption.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Grid 3: Purpose-Bound Legal-Sensitive Records & Statutory Disclaimers (§16.4) */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-400" />
              Purpose-Bound Legal-Sensitive Records (§16.4)
            </h3>
            <p className="text-xs text-slate-400">
              Access is purpose-bound, non-automatic, and strictly logged. ZoikoShield does not represent that legal privilege automatically exists.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={legalAccessReason}
              onChange={(e) => setLegalAccessReason(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
            >
              <option value="REGULATORY_INQUIRY">Purpose: Regulatory Inquiry</option>
              <option value="LEGAL_DEFENSE">Purpose: Legal Defense</option>
              <option value="INSURER_PROOF">Purpose: Insurer Proof</option>
              <option value="INCIDENT_COORDINATION">Purpose: Incident Coordination</option>
            </select>
            {selectedWorkOrder && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsLegalRecordModalOpen(true)}
                className="gap-1.5 text-xs text-purple-300 border-purple-500/30"
              >
                <Plus className="w-3.5 h-3.5" /> Record Legal Artifact
              </Button>
            )}
          </div>
        </div>

        {/* Statutory Legal Disclaimer Banner */}
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200/90 space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Statutory Legal Privilege Notice (Spec §16.4)
          </div>
          <p>
            Incident Response service does <strong>not</strong> establish legal privilege or provide breach-notification, regulatory, or legal conclusions unless a separately contracted service is controlled by qualified counsel. All accesses are audited and recorded to the tamper-evident ledger.
          </p>
        </div>

        {/* Legal Records Table */}
        <Card className="p-4 bg-slate-900/60 border-slate-800 backdrop-blur-md overflow-x-auto">
          {legalRecords.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No legal-sensitive records recorded under purpose &apos;{legalAccessReason}&apos;.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="pb-2">RECORD ID</th>
                  <th className="pb-2">PURPOSE</th>
                  <th className="pb-2">PRIVILEGE STATUS</th>
                  <th className="pb-2">COUNSEL CONTROL</th>
                  <th className="pb-2">CONTENT REFERENCE</th>
                  <th className="pb-2">ACCESS REASON</th>
                  <th className="pb-2">TIMESTAMP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {legalRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 text-cyan-400">{r.id}</td>
                    <td className="py-2.5">
                      <Badge variant="neutral">{r.purpose}</Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge variant={r.privilegeStatus === "COUNSEL_ASSERTED" ? "critical" : "neutral"}>
                        {r.privilegeStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      {r.counselControlled ? (
                        <span className="text-purple-400">COUNSEL CONTROLLED</span>
                      ) : (
                        <span className="text-slate-500">NONE (FACTUAL ONLY)</span>
                      )}
                    </td>
                    <td className="py-2.5 truncate max-w-[180px] text-slate-400">
                      {r.contentReference}
                    </td>
                    <td className="py-2.5 text-slate-400">{r.accessReason}</td>
                    <td className="py-2.5 text-[11px] text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Modal 1: Activate Emergency Work Order */}
      {isActivateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg bg-slate-900 border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" />
                  Activate Emergency IR Work Order
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Creates an isolated incident work order against active retainer {activeRetainer?.id}.
                </p>
              </div>
              <button
                onClick={() => setIsActivateModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleActivateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Incident Reference</label>
                <input
                  type="text"
                  value={activationForm.incidentReference}
                  onChange={(e) => setActivationForm({ ...activationForm, incidentReference: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Activation Reason</label>
                <input
                  type="text"
                  value={activationForm.activationReason}
                  onChange={(e) => setActivationForm({ ...activationForm, activationReason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Response Authority</label>
                  <select
                    value={activationForm.responseAuthority}
                    onChange={(e) =>
                      setActivationForm({
                        ...activationForm,
                        responseAuthority: e.target.value as "R0" | "R1" | "R2" | "R3" | "R4",
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="R0">R0 - Observation Only</option>
                    <option value="R1">R1 - Recommendation Only</option>
                    <option value="R2">R2 - Automated Containment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Authorization Ref</label>
                  <input
                    type="text"
                    value={activationForm.activationReference}
                    onChange={(e) => setActivationForm({ ...activationForm, activationReference: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Readiness Evidence Vault Refs (comma-separated)</label>
                <input
                  type="text"
                  value={activationForm.readinessEvidenceRefs}
                  onChange={(e) => setActivationForm({ ...activationForm, readinessEvidenceRefs: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="outline" type="button" onClick={() => setIsActivateModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" type="submit">
                  Confirm & Activate
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal 2: Log Hours */}
      {isLogHoursModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-slate-900 border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  Log Work Hours
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Deducts hours from included balance for {selectedWorkOrder?.incidentReference}.
                </p>
              </div>
              <button
                onClick={() => setIsLogHoursModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLogHoursSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Hours Spent</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={logHoursForm.hours}
                  onChange={(e) => setLogHoursForm({ ...logHoursForm, hours: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Work Description</label>
                <textarea
                  rows={3}
                  value={logHoursForm.workDescription}
                  onChange={(e) => setLogHoursForm({ ...logHoursForm, workDescription: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Evidence Reference Link</label>
                <input
                  type="text"
                  value={logHoursForm.evidenceReference}
                  onChange={(e) => setLogHoursForm({ ...logHoursForm, evidenceReference: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="outline" type="button" onClick={() => setIsLogHoursModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Record Consumption
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal 3: Create Legal-Sensitive Record */}
      {isLegalRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg bg-slate-900 border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-purple-400" />
                  Record Legal-Sensitive Artifact
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Stores purpose-bound legal context with statutory disclaimer (§16.4).
                </p>
              </div>
              <button
                onClick={() => setIsLegalRecordModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLegalRecordSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Purpose Classification</label>
                <select
                  value={legalForm.purpose}
                  onChange={(e) =>
                    setLegalForm({
                      ...legalForm,
                      purpose: e.target.value as any,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="REGULATOR_INQUIRY">REGULATOR_INQUIRY</option>
                  <option value="LEGAL_DEFENSE">LEGAL_DEFENSE</option>
                  <option value="INSURER_PROOF">INSURER_PROOF</option>
                  <option value="INCIDENT_COORDINATION">INCIDENT_COORDINATION</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Content Reference Link</label>
                <input
                  type="text"
                  value={legalForm.contentReference}
                  onChange={(e) => setLegalForm({ ...legalForm, contentReference: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Access & Purpose Justification</label>
                <textarea
                  rows={2}
                  value={legalForm.accessReason}
                  onChange={(e) => setLegalForm({ ...legalForm, accessReason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                <span className="text-amber-400 font-bold block mb-1">Legal Notice Attached:</span>
                &quot;This work order does not establish legal privilege or provide a breach-notification, regulatory, or legal conclusion.&quot;
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="outline" type="button" onClick={() => setIsLegalRecordModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="ai" type="submit">
                  Store Record
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
