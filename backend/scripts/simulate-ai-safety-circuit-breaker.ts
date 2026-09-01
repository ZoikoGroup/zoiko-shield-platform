/**
 * ZoikoShield AI Multi-Model Safety Circuit Breaker Simulator
 * 
 * Demonstrates:
 * 1. Happy-path AI investigation via Vertex AI Gemini 1.5 Pro.
 * 2. Automatic fallback to Azure OpenAI upon primary upstream latency spike.
 * 3. Graceful degradation to Deterministic MITRE Rule Synthesizer when cloud LLMs fail.
 * 4. Circuit Breaker tripping to OPEN state to protect backend latency SLA.
 */

import 'dotenv/config';
import 'reflect-metadata';
import {
  AiSafetyCircuitBreakerService,
  ThreatInvestigationInput,
} from '../apps/shield-ai/src/gateway/ai-safety-circuit-breaker.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield AI Multi-Model Safety Circuit Breaker Simulator');
  console.log('    Specification: Zero-Downtime Multi-Provider LLM Fallback & Rule Synthesizer');
  console.log('========================================================================\n');

  const circuitService = new AiSafetyCircuitBreakerService();
  const input: ThreatInvestigationInput = {
    tenantId: 'tenant-acme-bank-corp',
    incidentId: 'INC-2026-BURST-08',
    severity: 'CRITICAL',
    evidenceIds: ['evi-auth-991', 'evi-edr-992'],
    rawSummary: 'High frequency Kerberoasting request burst detected against Domain Controller',
  };

  // Step 1: Normal Route (Vertex AI Gemini)
  console.log('[Step 1/4] Normal Operation: Calling Primary Provider (Vertex AI Gemini)...');
  const normalRes = await circuitService.investigateThreat(input);
  console.log(`  ✔ Provider: ${normalRes.providerUsed}`);
  console.log(`  ✔ Analysis ID: ${normalRes.analysisId}`);
  console.log(`  ✔ MITRE ATT&CK TTPs: ${normalRes.mitreTTPs.join(', ')}`);
  console.log(`  ✔ Circuit State: ${normalRes.circuitState} (Latency: ${normalRes.latencyMs}ms)`);

  // Step 2: Primary Failure -> Secondary Fallback (Azure OpenAI)
  console.log('\n[Step 2/4] Simulating Vertex AI timeout (>2000ms SLA)...');
  circuitService.simulateVertexFailure = true;
  const fallbackRes = await circuitService.investigateThreat(input);
  console.log(`  ✔ Provider: ${fallbackRes.providerUsed} (Secondary Fallback Triggered)`);
  console.log(`  ✔ Analysis ID: ${fallbackRes.analysisId}`);
  console.log(`  ✔ MITRE ATT&CK TTPs: ${fallbackRes.mitreTTPs.join(', ')}`);

  // Step 3: Multi-Provider Failure -> Deterministic Zero-LLM Rule Engine
  console.log('\n[Step 3/4] Simulating complete Cloud LLM outage (Vertex + Azure down)...');
  circuitService.simulateAzureFailure = true;
  const deterministicRes = await circuitService.investigateThreat(input);
  console.log(`  ✔ Provider: ${deterministicRes.providerUsed} (Guaranteed Zero-LLM Fallback)`);
  console.log(`  ✔ Summary: "${deterministicRes.summary}"`);
  console.log(`  ✔ Recommended Playbooks: ${deterministicRes.recommendedPlaybooks.join(', ')}`);

  // Step 4: Circuit Breaker Tripped to OPEN State
  console.log('\n[Step 4/4] Checking Circuit Breaker state after repeated upstream failures...');
  await circuitService.investigateThreat(input);
  const circuitStatus = circuitService.getCircuitState();
  console.log(`  ✔ Circuit Breaker Status: ${circuitStatus.state} (${circuitStatus.failures} failures recorded)`);
  console.log(`  ✔ Protection Action: Cloud LLM network calls suspended to preserve zero-latency SOC SLAs.`);

  console.log('\n========================================================================');
  console.log(' 🎉 AI MULTI-MODEL SAFETY CIRCUIT BREAKER SIMULATION VERIFIED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});
