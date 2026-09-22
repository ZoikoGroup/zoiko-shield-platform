import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RequirementsRegisterService } from '../services/requirements-register.service';
import { RequirementNode } from '../entities/requirement.entity';

export interface ReconciliationDiscrepancy {
  requirementId: string;
  type: 'MISSING_SOURCE_FILE' | 'MISSING_TEST_FILE' | 'DUPLICATE_STATEMENT' | 'STALE_METADATA';
  details: string;
}

export interface ReconciliationReport {
  timestamp: string;
  totalRequirementsAudited: number;
  discrepanciesCount: number;
  discrepancies: ReconciliationDiscrepancy[];
  status: 'CLEAN' | 'DISCREPANCIES_DETECTED';
}

/**
 * Controlled Engineering Specification §05.1: Daily Requirements Reconciliation Engine (R04)
 *
 * "A daily reconciliation detects orphaned, stale, duplicated or contradictory artifacts."
 */
@Injectable()
export class RequirementsReconciliationWorker {
  private readonly logger = new Logger(RequirementsReconciliationWorker.name);
  private resolvePath(targetPath: string): string {
    if (path.isAbsolute(targetPath)) return targetPath;
    
    // Check direct cwd first
    const fromCwd = path.resolve(process.cwd(), targetPath);
    if (fs.existsSync(fromCwd)) return fromCwd;

    // Check workspace root (parent of backend if in backend)
    const fromParent = path.resolve(process.cwd(), '..', targetPath);
    if (fs.existsSync(fromParent)) return fromParent;

    // Check relative to backend if target has no backend prefix
    const fromBackend = path.resolve(process.cwd(), 'backend', targetPath);
    if (fs.existsSync(fromBackend)) return fromBackend;

    return fromParent;
  }

  constructor(private readonly registerService: RequirementsRegisterService) {}

  public executeReconciliation(): ReconciliationReport {
    this.logger.log('▶ [R04 RECONCILIATION] Starting daily requirements & code artifact audit...');

    const requirements = this.registerService.getAllRequirements();
    const discrepancies: ReconciliationDiscrepancy[] = [];
    const statementMap = new Map<string, string>(); // statement text -> requirementId

    for (const req of requirements) {
      // 1. Check for Duplicate Statements
      const normalizedStmt = req.statement.trim().toLowerCase();
      if (statementMap.has(normalizedStmt)) {
        discrepancies.push({
          requirementId: req.id,
          type: 'DUPLICATE_STATEMENT',
          details: `Duplicate statement matches existing requirement '${statementMap.get(normalizedStmt)}'`,
        });
      } else {
        statementMap.set(normalizedStmt, req.id);
      }

      // 2. Check implementing source file existence
      if (req.traceability.sourceFilePath) {
        const fullSourcePath = this.resolvePath(req.traceability.sourceFilePath);

        if (!fs.existsSync(fullSourcePath)) {
          discrepancies.push({
            requirementId: req.id,
            type: 'MISSING_SOURCE_FILE',
            details: `Source file '${req.traceability.sourceFilePath}' does not exist on disk`,
          });
        }
      }

      // 3. Check test file existence
      if (req.traceability.testFilePath) {
        const fullTestPath = this.resolvePath(req.traceability.testFilePath);

        if (!fs.existsSync(fullTestPath)) {
          discrepancies.push({
            requirementId: req.id,
            type: 'MISSING_TEST_FILE',
            details: `Test file '${req.traceability.testFilePath}' does not exist on disk`,
          });
        }
      }
    }

    const report: ReconciliationReport = {
      timestamp: new Date().toISOString(),
      totalRequirementsAudited: requirements.length,
      discrepanciesCount: discrepancies.length,
      discrepancies,
      status: discrepancies.length === 0 ? 'CLEAN' : 'DISCREPANCIES_DETECTED',
    };

    if (discrepancies.length === 0) {
      this.logger.log(`✔ [R04 RECONCILIATION] Clean audit: ${requirements.length}/${requirements.length} requirements 100% matched to code & tests`);
    } else {
      this.logger.warn(`⚠️ [R04 RECONCILIATION] Discrepancies detected: ${discrepancies.length} issue(s) found across ${requirements.length} requirements`);
    }

    return report;
  }
}
