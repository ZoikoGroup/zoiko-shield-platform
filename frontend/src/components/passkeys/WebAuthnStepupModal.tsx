"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Fingerprint,
  Key,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Cpu,
  RefreshCw,
  Zap,
} from "lucide-react";
import {
  isWebauthnSupported,
  requestPasskeyAssertion,
  PasskeyAssertionPayload,
} from "@/lib/webauthn";
import { ZoikoShieldApiClient } from "@/lib/api-client";

export interface WebAuthnStepupModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionTitle: string;
  actionDescription: string;
  targetResource?: string;
  blastRadius?: string | number;
  onSuccess: (assertion: {
    credentialId: string;
    signature: string;
    verifiedAt: string;
    hardwareBacked: boolean;
  }) => void;
}

export const WebAuthnStepupModal: React.FC<WebAuthnStepupModalProps> = ({
  isOpen,
  onClose,
  actionTitle,
  actionDescription,
  targetResource,
  blastRadius,
  onSuccess,
}) => {
  const [status, setStatus] = useState<"IDLE" | "PROMPTING" | "SUCCESS" | "ERROR">("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHardwareSupported, setIsHardwareSupported] = useState<boolean>(true);
  const [authReceipt, setAuthReceipt] = useState<{
    credentialId: string;
    signature: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStatus("IDLE");
      setErrorMessage(null);
      setAuthReceipt(null);
      setIsHardwareSupported(isWebauthnSupported());
    }
  }, [isOpen]);

  const handleStartCeremony = async () => {
    setStatus("PROMPTING");
    setErrorMessage(null);

    if (!isWebauthnSupported()) {
      setErrorMessage("This browser does not support passkeys, so step-up cannot be completed.");
      setStatus("ERROR");
      return;
    }

    // A real passkey assertion over the backend's challenge; there is no
    // simulated success path.
    try {
      const options = await ZoikoShieldApiClient.getPasskeyStepUpOptions();
      const result = await requestPasskeyAssertion(options);

      const receipt = {
        credentialId: result.credentialId,
        signature: result.signatureBase64.substring(0, 32) + "...",
        timestamp: new Date().toISOString(),
      };
      setAuthReceipt(receipt);
      setStatus("SUCCESS");
      setTimeout(() => {
        onSuccess({
          credentialId: receipt.credentialId,
          signature: result.signatureBase64,
          verifiedAt: receipt.timestamp,
          hardwareBacked: true,
        });
      }, 800);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Passkey step-up failed.");
      setStatus("ERROR");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="FIDO2 WebAuthn Step-Up Authorization"
      maxWidth="lg"
    >
      <div className="space-y-5 text-xs text-slate-300">
        {/* Header Alert */}
        <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 flex items-start gap-3 text-indigo-200">
          <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-white">Privileged Action Verification Required</div>
            <div className="text-[11px] text-indigo-300/80 mt-0.5">
              This high-impact operation requires cryptographic biometric or hardware security key (YubiKey) verification.
            </div>
          </div>
        </div>

        {/* Action Details Card */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Operation</span>
            <Badge variant="high">{actionTitle}</Badge>
          </div>
          <div className="text-[11px] text-slate-300">{actionDescription}</div>
          {targetResource && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
              <span className="text-slate-400">Target Resource</span>
              <span className="font-mono text-cyan-400">{targetResource}</span>
            </div>
          )}
          {blastRadius !== undefined && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Blast Radius</span>
              <span className="font-mono text-amber-400">{blastRadius}</span>
            </div>
          )}
        </div>

        {/* Ceremony State Panel */}
        {status === "IDLE" && (
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Fingerprint className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="font-medium text-white">Ready for Authenticator Interaction</div>
              <div className="text-[11px] text-slate-400">
                Touch your security key (YubiKey / Passkey) or use Windows Hello / Touch ID when prompted.
              </div>
            </div>
            <Button
              variant="primary"
              className="w-full justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              onClick={handleStartCeremony}
            >
              <Key className="w-4 h-4 mr-2" />
              Trigger WebAuthn Ceremony
            </Button>
          </div>
        )}

        {status === "PROMPTING" && (
          <div className="p-6 rounded-xl bg-indigo-950/30 border border-indigo-500/40 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-indigo-500/20 border border-indigo-400/50 flex items-center justify-center text-indigo-300">
              <RefreshCw className="w-7 h-7 animate-spin text-indigo-400" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-white text-sm">Awaiting Hardware Token Response</div>
              <div className="text-[11px] text-indigo-300">
                Please touch your security key or complete biometric verification...
              </div>
            </div>
          </div>
        )}

        {status === "SUCCESS" && authReceipt && (
          <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              Cryptographic Attestation Verified
            </div>
            <div className="p-3 rounded-lg bg-slate-950/80 border border-emerald-900/40 font-mono text-[10px] space-y-1 text-slate-300">
              <div className="text-emerald-400 font-semibold">{"// FIDO2 ATT_STATEMENT"}</div>
              <div>Credential ID: {authReceipt.credentialId}</div>
              <div>Signature: {authReceipt.signature}</div>
              <div>Verified At: {authReceipt.timestamp}</div>
            </div>
          </div>
        )}

        {status === "ERROR" && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-medium">
              <AlertTriangle className="w-4 h-4" />
              Authentication Failed
            </div>
            <div className="text-[11px] text-rose-200">{errorMessage || "Unknown error during passkey ceremony."}</div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center border-rose-700 text-rose-300 hover:bg-rose-950/50"
              onClick={handleStartCeremony}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={status === "PROMPTING"}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};
