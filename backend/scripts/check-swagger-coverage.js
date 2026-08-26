const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const yaml = require('js-yaml');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(target);
    return entry.name.endsWith('.controller.ts') ? [target] : [];
  });
}

function decorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function literalValues(expression) {
  if (!expression) return [''];
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  )
    return [expression.text];
  if (ts.isArrayLiteralExpression(expression))
    return expression.elements.flatMap(literalValues);
  return [];
}

function discoverRoutes() {
  const routes = [];
  for (const file of files(path.join(__dirname, '..', 'apps'))) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;
      const controller = decorators(node).find(
        (decorator) =>
          ts.isCallExpression(decorator.expression) &&
          decorator.expression.expression.getText(source) === 'Controller',
      );
      if (!controller || !ts.isCallExpression(controller.expression)) return;
      const prefixes = literalValues(controller.expression.arguments[0]);
      const classDecorators = decorators(node);
      const classIsPublicIngress = classDecorators.some((decorator) =>
        decorator.expression.getText(source).startsWith('PublicIngress'),
      );
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const methodDecorators = decorators(member);
        const requiresTenantHeader = member.parameters.some((parameter) =>
          decorators(parameter).some((decorator) => {
            if (!ts.isCallExpression(decorator.expression)) return false;
            if (decorator.expression.expression.getText(source) !== 'Headers')
              return false;
            return literalValues(decorator.expression.arguments[0]).some(
              (header) => header.toLowerCase() === 'x-tenant-id',
            );
          }),
        );
        const methodIsPublicIngress = methodDecorators.some((decorator) =>
          decorator.expression.getText(source).startsWith('PublicIngress'),
        );
        for (const decorator of decorators(member)) {
          if (!ts.isCallExpression(decorator.expression)) continue;
          const method = decorator.expression.expression
            .getText(source)
            .toLowerCase();
          if (!['get', 'post', 'patch', 'put', 'delete'].includes(method))
            continue;
          for (const prefix of prefixes) {
            for (const suffix of literalValues(
              decorator.expression.arguments[0],
            )) {
              const route = `/${[prefix, suffix].filter(Boolean).join('/')}`
                .replace(/\/+/g, '/')
                .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
              routes.push({
                method,
                route,
                file: path
                  .relative(path.join(__dirname, '..'), file)
                  .replace(/\\/g, '/'),
                publicIngress: classIsPublicIngress || methodIsPublicIngress,
                requiresTenantHeader,
                guardContract: [...classDecorators, ...methodDecorators]
                  .map((item) => item.expression.getText(source))
                  .join(' '),
                operation: `${path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/')}:${member.name?.getText(source) ?? 'anonymous'}:${method}`,
              });
            }
          }
        }
      }
    });
  }
  return routes;
}

const specificationPath = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'swagger.yaml',
);
const specification = yaml.load(fs.readFileSync(specificationPath, 'utf8'));
const ignored = [/^\/$/, /^\/health(?:\/|$)/];
const publicRoutes = discoverRoutes().filter(
  ({ route }) => !ignored.some((pattern) => pattern.test(route)),
);
function normalizedRoute(route) {
  return route.replace(/\{[^}]+\}/g, '{}');
}
const documentedOperations = new Set();
const documentedSecurity = new Map();
const documentedTenantHeaders = new Map();
const approvedPublicOperations = new Set([
  'post:/auth/login',
  'post:/auth/logout',
  'post:/auth/password-recovery/request',
  'post:/auth/password-recovery/verify',
  'get:/api/v1/auth/sso/discovery/{tenantSlug}',
  'post:/api/v1/auth/sso/start',
  'get:/api/v1/auth/sso/oidc/callback',
  'post:/api/v1/auth/sso/saml/callback',
  'get:/api/v1/auth/sso/saml/metadata/{tenantSlug}/{providerId}',
  'post:/oauth/token',
  'get:/v1/connectors/entra/callback',
  'post:/v1/webhooks/microsoft-graph',
  'post:/api/v1/payments/webhook',
  'get:/metrics',
  'get:/',
]);
const undocumentedSecurity = [];
for (const [route, definition] of Object.entries(specification.paths ?? {})) {
  for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
    const operation = definition[method];
    if (!operation) continue;
    const operationKey = `${method}:${route}`;
    const normalizedOperationKey = `${method}:${normalizedRoute(route)}`;
    documentedOperations.add(normalizedOperationKey);
    documentedSecurity.set(
      normalizedOperationKey,
      new Set(
        (operation.security ?? []).flatMap((requirement) =>
          Object.keys(requirement),
        ),
      ),
    );
    documentedTenantHeaders.set(
      normalizedOperationKey,
      [...(definition.parameters ?? []), ...(operation.parameters ?? [])].some(
        (parameter) =>
          parameter?.$ref === '#/components/parameters/TenantIdHeader' ||
          (parameter?.in === 'header' &&
            parameter?.name?.toLowerCase() === 'x-tenant-id'),
      ),
    );
    if (!Array.isArray(operation.security)) {
      undocumentedSecurity.push(
        `${method.toUpperCase()} ${route} has no explicit security contract`,
      );
    } else if (
      operation.security.length === 0 &&
      !approvedPublicOperations.has(operationKey)
    ) {
      undocumentedSecurity.push(
        `${method.toUpperCase()} ${route} is marked public but is not an approved public ingress`,
      );
    }
  }
}
const operations = new Map();
for (const route of publicRoutes) {
  const group = operations.get(route.operation) ?? [];
  group.push(route);
  operations.set(route.operation, group);
}

const primarySecuritySchemes = new Set([
  'CookieAuth',
  'BearerAuth',
  'InternalServiceAuth',
  'WebhookHmacAuth',
]);
const expectedPrimarySecurity = new Map();
const expectedTenantHeaders = new Set();
for (const route of publicRoutes) {
  const key = `${route.method}:${normalizedRoute(route.route)}`;
  if (route.requiresTenantHeader) expectedTenantHeaders.add(key);
  const expected = expectedPrimarySecurity.get(key) ?? new Set();
  if (route.file.includes('apps/shield-ingest/')) {
    if (route.file.endsWith('ingestion/webhook-ingest.controller.ts')) {
      expected.add('WebhookHmacAuth');
    } else if (!route.publicIngress) {
      expected.add('InternalServiceAuth');
    }
  } else {
    if (route.guardContract.includes('JwtAuthGuard')) {
      expected.add('CookieAuth');
      expected.add('BearerAuth');
    }
    if (route.guardContract.includes('ApiClientAuthGuard')) {
      expected.add('BearerAuth');
    }
    if (route.guardContract.includes('InternalAuthGuard')) {
      expected.add('InternalServiceAuth');
    }
    if (route.guardContract.includes('WebhookSignatureGuard')) {
      expected.add('WebhookHmacAuth');
    }
  }
  expectedPrimarySecurity.set(key, expected);
}

if (process.argv.includes('--fix-security')) {
  const preferredOrder = [
    'CookieAuth',
    'BearerAuth',
    'InternalServiceAuth',
    'WebhookHmacAuth',
  ];
  const lines = fs.readFileSync(specificationPath, 'utf8').split('\n');
  const output = [];
  let route = '';
  let method = '';
  let changes = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pathMatch = line.match(/^  (\/.*):$/);
    if (pathMatch) {
      route = pathMatch[1];
      method = '';
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/);
    if (methodMatch) method = methodMatch[1];
    if (line !== '      security:' && line !== '      security: []') {
      output.push(line);
      continue;
    }

    const expected = expectedPrimarySecurity.get(
      `${method}:${normalizedRoute(route)}`,
    );
    if (!expected) {
      output.push(line);
      continue;
    }

    const preservedNonPrimary = [];
    if (line === '      security:') {
      while (index + 1 < lines.length) {
        const requirement = lines[index + 1].match(
          /^      - ([A-Za-z0-9_]+): \[\]$/,
        );
        if (!requirement) break;
        index += 1;
        if (!primarySecuritySchemes.has(requirement[1])) {
          preservedNonPrimary.push(lines[index]);
        }
      }
    }

    if (expected.size > 0) {
      output.push('      security:');
      for (const scheme of preferredOrder) {
        if (expected.has(scheme)) output.push(`      - ${scheme}: []`);
      }
    } else if (preservedNonPrimary.length > 0) {
      output.push('      security:', ...preservedNonPrimary);
    } else {
      output.push('      security: []');
    }
    changes += 1;
  }
  fs.writeFileSync(specificationPath, output.join('\n'));
  console.log(
    `Reconciled primary security for ${changes} documented operations.`,
  );
  process.exit(0);
}

if (process.argv.includes('--fix-tenant-headers')) {
  const lines = fs.readFileSync(specificationPath, 'utf8').split('\n');
  const operationsToFix = [];
  let route = '';
  for (let index = 0; index < lines.length; index += 1) {
    const pathMatch = lines[index].match(/^  (\/.*):$/);
    if (pathMatch) route = pathMatch[1];
    const methodMatch = lines[index].match(
      /^    (get|post|put|patch|delete):$/,
    );
    if (!methodMatch) continue;
    const key = `${methodMatch[1]}:${normalizedRoute(route)}`;
    if (!expectedTenantHeaders.has(key) || documentedTenantHeaders.get(key))
      continue;
    let end = index + 1;
    while (
      end < lines.length &&
      !/^  \/.*:$/.test(lines[end]) &&
      !/^    (get|post|put|patch|delete):$/.test(lines[end]) &&
      !/^components:$/.test(lines[end])
    ) {
      end += 1;
    }
    operationsToFix.push({ start: index, end });
  }

  for (const { start, end } of operationsToFix.reverse()) {
    const parametersIndex = lines.findIndex(
      (line, index) =>
        index > start && index < end && line === '      parameters:',
    );
    if (parametersIndex >= 0) {
      lines.splice(
        parametersIndex + 1,
        0,
        "      - $ref: '#/components/parameters/TenantIdHeader'",
      );
    } else {
      lines.splice(
        start + 1,
        0,
        '      parameters:',
        "      - $ref: '#/components/parameters/TenantIdHeader'",
      );
    }
  }

  fs.writeFileSync(specificationPath, lines.join('\n'));
  console.log(
    `Added TenantIdHeader to ${operationsToFix.length} documented operations.`,
  );
  process.exit(0);
}

for (const [key, expected] of expectedPrimarySecurity) {
  if (!documentedOperations.has(key)) continue;
  const actual = new Set(
    [...(documentedSecurity.get(key) ?? [])].filter((scheme) =>
      primarySecuritySchemes.has(scheme),
    ),
  );
  const missingSchemes = [...expected].filter((scheme) => !actual.has(scheme));
  const extraSchemes = [...actual].filter((scheme) => !expected.has(scheme));
  if (missingSchemes.length || extraSchemes.length) {
    undocumentedSecurity.push(
      `${key.replace(':', ' ').toUpperCase()} primary security mismatch` +
        ` (expected: ${[...expected].join(', ') || 'public'};` +
        ` documented: ${[...actual].join(', ') || 'public'})`,
    );
  }
}
for (const key of expectedTenantHeaders) {
  if (!documentedOperations.has(key)) continue;
  if (!documentedTenantHeaders.get(key)) {
    undocumentedSecurity.push(
      `${key.replace(':', ' ').toUpperCase()} requires x-tenant-id but omits TenantIdHeader`,
    );
  }
}
const missing = [...operations.values()]
  .filter(
    (aliases) =>
      !aliases.some(({ route, method }) =>
        documentedOperations.has(`${method}:${normalizedRoute(route)}`),
      ),
  )
  .map((aliases) => aliases[0]);

for (const route of publicRoutes) {
  const security = documentedSecurity.get(
    `${route.method}:${normalizedRoute(route.route)}`,
  );
  if (!security) continue;
  if (
    route.file.includes('apps/shield-ingest/') &&
    !route.publicIngress &&
    !security.has('InternalServiceAuth')
  ) {
    undocumentedSecurity.push(
      `${route.method.toUpperCase()} ${route.route} is workload-authenticated by shield-ingest but omits InternalServiceAuth`,
    );
  }
  if (
    route.file.endsWith('ingestion/webhook-ingest.controller.ts') &&
    !security.has('WebhookHmacAuth')
  ) {
    undocumentedSecurity.push(
      `${route.method.toUpperCase()} ${route.route} requires connector HMAC authentication but omits WebhookHmacAuth`,
    );
  }
}

if (missing.length || undocumentedSecurity.length) {
  for (const item of missing)
    console.error(`${item.method.toUpperCase()} ${item.route} (${item.file})`);
  for (const issue of undocumentedSecurity) console.error(issue);
  if (missing.length) {
    console.error(
      `${missing.length} externally reachable controller operation(s) are missing from docs/swagger.yaml`,
    );
  }
  if (undocumentedSecurity.length) {
    console.error(
      `${undocumentedSecurity.length} OpenAPI operation(s) have an unsafe or missing security declaration`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    'Swagger covers every customer and internal controller operation with an explicit security contract.',
  );
}
