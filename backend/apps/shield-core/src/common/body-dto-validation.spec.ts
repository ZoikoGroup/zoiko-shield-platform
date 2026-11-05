import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import 'reflect-metadata';
import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import {
  AssignAlertDto,
  CloseAlertDto,
  UpdateAlertStatusDto,
} from '../modules/alert/controllers/alert.controller';
import { AcceptFindingDto } from '../modules/findings/findings.controller';
import {
  ApproveProposalDto,
  CreateProposalDto,
  RejectProposalDto,
} from '../modules/response-proposal/controllers/response-proposal.controller';
import { CreateJitElevationDto } from '../modules/jit-elevation/jit-elevation.service';
import { ScimPatchDto } from '../modules/identity-adapter/scim/dto/scim-patch.dto';
import { CreateScimUserDto } from '../modules/identity-adapter/scim/dto/scim-user.dto';
import { AddPaymentMethodDto } from '../modules/payments/payment-method.service';
import { RegisterObligationDto } from '../modules/managed-defense/mdr-service-obligation.service';
import {
  CreateRequirementDto,
  QueryRequirementsDto,
} from '../modules/requirements-register/dto/requirement.dto';
import {
  IssueVerifiableCredentialDto,
  VerifyVerifiableCredentialDto,
} from '../modules/verifiable-credentials/verifiable-credential.controller';
import { VerifiableCredentialService } from '../modules/verifiable-credentials/verifiable-credential.service';

/**
 * main.ts installs `new ValidationPipe({ whitelist: true, transform: true })`.
 * With whitelist on, class-validator strips every property that carries no
 * class-validator decorator, so an undecorated DTO reaches its handler as an
 * empty object (e.g. PATCH /alerts/:id/status failed with "Unknown target
 * alert status 'undefined'"). This spec guards both halves of that contract:
 *
 *  1. a static scan of every @Body()/@Query()/@Param() parameter typed as a
 *     class, failing on any property the pipe would silently strip;
 *  2. a runtime check, through the real pipe, that representative DTOs keep
 *     their fields and still reject invalid input.
 */

const SRC_ROOT = path.resolve(__dirname, '..');
const NEST_PARAM_DECORATORS = new Set(['Body', 'Query', 'Param']);

interface ClassRef {
  file: string;
  name: string;
}

interface ParsedFile {
  sf: ts.SourceFile;
  /** local name -> { module specifier, imported name } */
  imports: Map<string, { from: string; name: string; typeOnly: boolean }>;
  classes: Map<string, ts.ClassDeclaration>;
  /** names re-exported from another module: `export { X } from './y'` */
  reExports: Map<string, { from: string; name: string }>;
  starReExports: string[];
}

const parsed = new Map<string, ParsedFile>();

function parse(file: string): ParsedFile {
  const cached = parsed.get(file);
  if (cached) return cached;
  const sf = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const result: ParsedFile = {
    sf,
    imports: new Map(),
    classes: new Map(),
    reExports: new Map(),
    starReExports: [],
  };
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const from = (stmt.moduleSpecifier as ts.StringLiteral).text;
      const clause = stmt.importClause;
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          result.imports.set(el.name.text, {
            from,
            name: (el.propertyName ?? el.name).text,
            typeOnly: clause.isTypeOnly || el.isTypeOnly,
          });
        }
      }
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      result.classes.set(stmt.name.text, stmt);
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      const from = (stmt.moduleSpecifier as ts.StringLiteral).text;
      if (!stmt.exportClause) result.starReExports.push(from);
      else if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          result.reExports.set(el.name.text, {
            from,
            name: (el.propertyName ?? el.name).text,
          });
        }
      }
    }
  }
  parsed.set(file, result);
  return result;
}

function resolveModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null; // package import: not ours
  const base = path.resolve(
    path.dirname(fromFile),
    specifier.replace(/\.js$/, ''),
  );
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // A relative import we cannot follow would make the scan skip that DTO
  // silently; fail loudly instead.
  throw new Error(`Cannot resolve '${specifier}' imported from ${fromFile}`);
}

/** Find the exported class `name` in `file`, following re-exports. */
function findExportedClass(
  file: string,
  name: string,
  seen = new Set<string>(),
): ClassRef | null {
  if (seen.has(`${file}#${name}`)) return null;
  seen.add(`${file}#${name}`);
  const pf = parse(file);
  if (pf.classes.has(name)) return { file, name };
  const re = pf.reExports.get(name);
  if (re) {
    const target = resolveModule(file, re.from);
    if (target) return findExportedClass(target, re.name, seen);
  }
  for (const from of pf.starReExports) {
    const target = resolveModule(file, from);
    const found = target && findExportedClass(target, name, seen);
    if (found) return found;
  }
  return null;
}

/**
 * Resolve an identifier used in `file` to a class declaration, by import path
 * rather than by name so two DTOs with the same name cannot be confused.
 * Interfaces and type aliases resolve to null: Nest sees `Object` for those
 * and the ValidationPipe passes them through untouched.
 */
function resolveClass(file: string, name: string): ClassRef | null {
  const pf = parse(file);
  if (pf.classes.has(name)) return { file, name };
  const imp = pf.imports.get(name);
  if (!imp || imp.typeOnly) return null;
  const target = resolveModule(file, imp.from);
  return target ? findExportedClass(target, imp.name) : null;
}

function decoratorName(d: ts.Decorator): string | null {
  const expr = ts.isCallExpression(d.expression)
    ? d.expression.expression
    : d.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function isClassValidatorDecorator(pf: ParsedFile, d: ts.Decorator): boolean {
  const expr = ts.isCallExpression(d.expression)
    ? d.expression.expression
    : d.expression;
  if (ts.isIdentifier(expr)) {
    return pf.imports.get(expr.text)?.from === 'class-validator';
  }
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const ns = expr.expression.text;
    return pf.sf.statements.some(
      (s) =>
        ts.isImportDeclaration(s) &&
        (s.moduleSpecifier as ts.StringLiteral).text === 'class-validator' &&
        !!s.importClause?.namedBindings &&
        ts.isNamespaceImport(s.importClause.namedBindings) &&
        s.importClause.namedBindings.name.text === ns,
    );
  }
  return false;
}

/** `@Type(() => X)` target, so nested DTOs are checked as well. */
function nestedTypeTarget(d: ts.Decorator): string | null {
  if (decoratorName(d) !== 'Type' || !ts.isCallExpression(d.expression)) {
    return null;
  }
  const arg = d.expression.arguments[0];
  if (arg && ts.isArrowFunction(arg) && ts.isIdentifier(arg.body)) {
    return arg.body.text;
  }
  return null;
}

/** Properties of `ref` (and its ancestors) the whitelist would strip. */
function strippedProperties(
  ref: ClassRef,
  visited = new Set<string>(),
): string[] {
  const key = `${ref.file}#${ref.name}`;
  if (visited.has(key)) return [];
  visited.add(key);
  const pf = parse(ref.file);
  const cls = pf.classes.get(ref.name)!;
  const out: string[] = [];
  const label = `${ref.name} (${path.relative(SRC_ROOT, ref.file)})`;

  for (const member of cls.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) {
      continue;
    }
    const decorators = ts.getDecorators(member) ?? [];
    const prop = member.name.getText(pf.sf);
    if (!decorators.some((d) => isClassValidatorDecorator(pf, d))) {
      out.push(`${label}.${prop}`);
    }
    for (const d of decorators) {
      const nested = nestedTypeTarget(d);
      const nestedRef = nested && resolveClass(ref.file, nested);
      if (nestedRef) out.push(...strippedProperties(nestedRef, visited));
    }
  }

  for (const clause of cls.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    for (const t of clause.types) {
      if (!ts.isIdentifier(t.expression)) continue;
      const parent = resolveClass(ref.file, t.expression.text);
      if (parent) out.push(...strippedProperties(parent, visited));
    }
  }
  return out;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(p, files);
    } else if (
      p.endsWith('.ts') &&
      !p.endsWith('.spec.ts') &&
      !p.endsWith('.d.ts')
    ) {
      files.push(p);
    }
  }
  return files;
}

/** Every class-typed @Body()/@Query()/@Param() parameter in shield-core. */
function findValidatedParameters(): Array<{ site: string; ref: ClassRef }> {
  const found: Array<{ site: string; ref: ClassRef }> = [];
  for (const file of walk(SRC_ROOT)) {
    const pf = parse(file);
    const visit = (node: ts.Node) => {
      if (ts.isParameter(node) && node.type) {
        const nestDecorator = (ts.getDecorators(node) ?? []).find((d) => {
          const name = decoratorName(d);
          return (
            !!name &&
            NEST_PARAM_DECORATORS.has(name) &&
            pf.imports.get(name)?.from === '@nestjs/common'
          );
        });
        if (
          nestDecorator &&
          ts.isTypeReferenceNode(node.type) &&
          ts.isIdentifier(node.type.typeName)
        ) {
          const ref = resolveClass(file, node.type.typeName.text);
          if (ref) {
            const { line } = pf.sf.getLineAndCharacterOfPosition(
              node.getStart(pf.sf),
            );
            found.push({
              site: `${path.relative(SRC_ROOT, file)}:${line + 1}`,
              ref,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(pf.sf);
  }
  return found;
}

describe('request DTOs survive ValidationPipe({ whitelist: true })', () => {
  it('finds the controller parameters it is meant to guard', () => {
    // A scanner that silently matches nothing would pass vacuously.
    const params = findValidatedParameters();
    const names = new Set(params.map((p) => p.ref.name));
    expect(params.length).toBeGreaterThan(50);
    for (const expected of [
      'UpdateAlertStatusDto',
      'CreateProposalDto',
      'ScimPatchDto',
      'ResolveAssetRequestDto',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('every property of every @Body/@Query/@Param DTO class carries a class-validator decorator', () => {
    const offenders = new Map<string, Set<string>>();
    for (const { site, ref } of findValidatedParameters()) {
      for (const prop of strippedProperties(ref)) {
        (offenders.get(prop) ?? offenders.set(prop, new Set()).get(prop)!).add(
          site,
        );
      }
    }
    const report = [...offenders.entries()]
      .map(([prop, sites]) => `${prop}  <- ${[...sites].join(', ')}`)
      .sort();
    expect(report).toEqual([]);
  });
});

describe('representative DTOs through the real global ValidationPipe', () => {
  // Same options as main.ts.
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const run = (
    metatype: new () => object,
    value: unknown,
    type: ArgumentMetadata['type'] = 'body',
  ) => pipe.transform(value, { type, metatype });
  /** Round-trip through JSON so the comparison sees exactly what a handler would forward. */
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
  const without = (o: Record<string, unknown>, key: string) => {
    const copy = { ...o };
    delete copy[key];
    return copy;
  };

  const accepts = async (
    metatype: new () => object,
    body: Record<string, unknown>,
    type: ArgumentMetadata['type'] = 'body',
  ) => {
    const out = await run(metatype, body, type);
    expect(out).toBeInstanceOf(metatype);
    expect(plain(out)).toEqual(body);
    return out;
  };
  const rejects = (
    metatype: new () => object,
    body: unknown,
    type: ArgumentMetadata['type'] = 'body',
  ) =>
    expect(run(metatype, body, type)).rejects.toBeInstanceOf(
      BadRequestException,
    );

  it('UpdateAlertStatusDto keeps status and only accepts AlertStatus values', async () => {
    await accepts(UpdateAlertStatusDto, { status: 'ACKNOWLEDGED' });
    await rejects(UpdateAlertStatusDto, {});
    await rejects(UpdateAlertStatusDto, { status: 'acknowledged' });
    await rejects(UpdateAlertStatusDto, { status: 'DELETED' });
  });

  it('still strips properties that are not declared (whitelist stays on)', async () => {
    const out = await run(UpdateAlertStatusDto, {
      status: 'TRIAGED',
      tenantId: 'someone-elses-tenant',
    });
    expect(plain(out)).toEqual({ status: 'TRIAGED' });
  });

  it('CloseAlertDto keeps the optional disposition and allows an empty body', async () => {
    await accepts(CloseAlertDto, {});
    await accepts(CloseAlertDto, { status: 'FALSE_POSITIVE' });
    await rejects(CloseAlertDto, { status: 'NOT_A_STATUS' });
  });

  it('AssignAlertDto keeps principal, queue and reason', async () => {
    await accepts(AssignAlertDto, {
      principalId: 'user-1',
      queueId: 'tier-2',
      reason: 'on call',
    });
    await accepts(AssignAlertDto, { queueId: 'tier-2' });
    await rejects(AssignAlertDto, { principalId: 42 });
  });

  it('AcceptFindingDto keeps every field and requires an ISO expiry', async () => {
    const body = {
      rationale: 'Compensated by network segmentation',
      authority: 'CISO',
      expiresAt: '2027-01-31T00:00:00.000Z',
      reviewAt: '2026-12-01',
      compensatingControls: ['segmentation', 'EDR'],
      riskRef: 'RISK-12',
      authorizationDecisionId: 'dec-1',
    };
    await accepts(AcceptFindingDto, body);
    await rejects(AcceptFindingDto, without(body, 'expiresAt'));
    await rejects(AcceptFindingDto, { ...body, expiresAt: 'next year' });
    await rejects(AcceptFindingDto, { ...body, compensatingControls: 'EDR' });
  });

  it('CreateProposalDto keeps the proposal fields', async () => {
    const body = {
      environmentId: 'env-a',
      alertId: 'alert-1',
      targetType: 'USER',
      targetId: 'user-1',
      actionType: 'DISABLE_ACCOUNT',
      reason: 'Credential stuffing from known-bad ASN',
      recommendationSource: 'HUMAN',
      reversible: true,
      rollbackActionType: 'ENABLE_ACCOUNT',
      residualRisk: 'User locked out until review',
    };
    await accepts(CreateProposalDto, body);
    await rejects(CreateProposalDto, without(body, 'targetId'));
    await rejects(CreateProposalDto, { ...body, reversible: 'yes' });
  });

  it('RejectProposalDto keeps the reason and requires one', async () => {
    await accepts(RejectProposalDto, {
      reason: 'Rejected from proposal queue',
    });
    await rejects(RejectProposalDto, {});
    await rejects(RejectProposalDto, { reason: '' });
  });

  it('ApproveProposalDto keeps reason alongside the human-authority attestation', async () => {
    await accepts(ApproveProposalDto, {
      reason: 'Approved from proposal queue',
      humanAuthority: {
        decisionOrigin: 'HUMAN',
        humanConfirmation: true,
        authorityStatement: 'I approve this containment action',
      },
    });
  });

  it('CreateJitElevationDto keeps the elevation request', async () => {
    const body = {
      operatorId: 'usr-analyst-01',
      operatorName: 'Alex',
      targetTenantId: 'tenant-a',
      elevatedRole: 'TENANT_ADMIN',
      statedPurpose: 'Investigate INC-1234 containment failure',
      durationMinutes: 60,
      clientIp: '10.0.0.7',
      initialHardwareProof: 'fido2-attestation-1',
    };
    await accepts(CreateJitElevationDto, body);
    await rejects(CreateJitElevationDto, { ...body, durationMinutes: '60' });
    await rejects(CreateJitElevationDto, { ...body, clientIp: 'localhost' });
    await rejects(CreateJitElevationDto, without(body, 'operatorId'));
  });

  it('ScimPatchDto keeps Operations, including open-shaped values', async () => {
    const body = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        { op: 'Replace', value: { active: false } },
        {
          op: 'add',
          path: 'emails',
          value: [{ value: 'a@b.c', primary: true }],
        },
        { op: 'remove', path: 'members[value eq "u1"]' },
        { op: 'replace', path: 'displayName', value: 'New Name' },
      ],
    };
    await accepts(ScimPatchDto, body);
    await rejects(ScimPatchDto, { ...body, Operations: [{ op: 'merge' }] });
    await rejects(ScimPatchDto, { schemas: body.schemas });
  });

  it('CreateScimUserDto keeps nested name and emails', async () => {
    await accepts(CreateScimUserDto, {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'jane@example.com',
      name: { givenName: 'Jane', familyName: 'Doe' },
      emails: [{ value: 'jane@example.com', type: 'work', primary: true }],
      active: true,
      externalId: 'ext-1',
    });
    await rejects(CreateScimUserDto, {
      schemas: [],
      userName: 'jane@example.com',
      emails: [{ primary: true }],
    });
  });

  it('AddPaymentMethodDto keeps payment fields and billing details', async () => {
    const body = {
      commercialAccountId: 'acct-1',
      type: 'CARD',
      provider: 'STRIPE',
      providerPaymentMethodRef: 'pm_123',
      lastFour: '4242',
      cardBrand: 'visa',
      expiryMonth: 12,
      expiryYear: 2030,
      isPrimary: true,
      billingDetails: { name: 'Acme', address: { country: 'GB' } },
    };
    await accepts(AddPaymentMethodDto, body);
    await rejects(AddPaymentMethodDto, { ...body, type: 'CRYPTO' });
    await rejects(AddPaymentMethodDto, {
      ...body,
      lastFour: '4242424242424242',
    });
    await rejects(AddPaymentMethodDto, { ...body, expiryMonth: 13 });
  });

  it('RegisterObligationDto validates the nested staffing schedule', async () => {
    const body = {
      contractId: 'contract-1',
      tenantId: 'tenant-a',
      coverageTier: 'CONTINUOUS_24X7',
      staffingSchedule: {
        coverageTier: 'CONTINUOUS_24X7',
        primaryTimezone: 'UTC',
        minimumActiveAnalystsOnDuty: 3,
        escalationLeadAvailable: true,
        tier3IncidentCommanderOnCall: true,
        shiftHandoffProtocolProven: true,
      },
      escalationPath: [
        {
          tierLevel: 1,
          roleTitle: 'Tier 1 SOC Analyst',
          responseWindowMinutes: 15,
          notificationChannels: ['SECOPS_PAGER'],
          requiresQuorumApproval: false,
        },
      ],
      operationalProofRef: 'proof-1',
    };
    await accepts(RegisterObligationDto, body);
    await rejects(RegisterObligationDto, without(body, 'staffingSchedule'));
    await rejects(RegisterObligationDto, {
      ...body,
      staffingSchedule: {
        ...body.staffingSchedule,
        shiftHandoffProtocolProven: 'yes',
      },
    });
  });

  it('CreateRequirementDto keeps nested authority, evidence and traceability', async () => {
    const body = {
      id: 'REQ-CORE-AUTH-01',
      version: '1.0.0',
      title: 'Fail closed on auth outage',
      statement: 'Deny access when the identity provider is unreachable.',
      tenantScope: 'MULTI_TENANT',
      dataScope: 'INTERNAL_COMMERCIAL',
      authority: { type: 'CONTROLLED_SPEC', reference: 'Spec §05' },
      failureBehavior: 'FAIL_CLOSED',
      aiStatus: 'DETERMINISTIC_ONLY',
      evidenceObligation: {
        requiresMerkleProof: true,
        requiresWitnessSeal: false,
        requiresPostQuantumSignature: false,
      },
      acceptanceCriteria: ['Returns 503 when IdP is down'],
      verificationMethod: 'AUTOMATED_UNIT_TEST',
      traceability: { implementingModule: 'identity-adapter' },
    };
    await accepts(CreateRequirementDto, body);
    await rejects(CreateRequirementDto, {
      ...body,
      authority: { type: 'BLOG_POST', reference: 'x' },
    });
  });

  it('QueryRequirementsDto keeps @Query() filters', async () => {
    await accepts(
      QueryRequirementsDto,
      { tenantScope: 'MULTI_TENANT', implementingModule: 'identity-adapter' },
      'query',
    );
    await rejects(QueryRequirementsDto, { status: 'nope' }, 'query');
  });

  it('a verifiable credential issued through the pipe still verifies through the pipe', async () => {
    const vc = new VerifiableCredentialService();
    const issueDto = (await run(IssueVerifiableCredentialDto, {
      subjectDid: 'did:key:zSubject1',
      claims: {
        operatorId: 'op-1',
        tenantId: 'tenant-a',
        role: 'SECURITY_ENGINEER',
        clearanceLevel: 'TIER_2_ELEVATED',
        grantedScopes: ['alerts:read'],
      },
      validityDurationHours: 1,
    })) as IssueVerifiableCredentialDto;
    expect(issueDto.claims.grantedScopes).toEqual(['alerts:read']);
    const credential = vc.issueVerifiableCredential({
      subjectDid: issueDto.subjectDid,
      claims: issueDto.claims,
      validityDurationHours: issueDto.validityDurationHours ?? 24,
    });
    // As an HTTP client would see and resend it.
    const verifyDto = (await run(VerifyVerifiableCredentialDto, {
      credential: plain(credential),
    })) as VerifyVerifiableCredentialDto;
    expect(() =>
      vc.verifyVerifiableCredential(verifyDto.credential),
    ).not.toThrow();
    await rejects(VerifyVerifiableCredentialDto, { credential: 'eyJ...' });
  });
});
