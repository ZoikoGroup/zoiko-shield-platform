const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const sourceRoot = path.join(__dirname, '..', 'apps', 'shield-core', 'src');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(target);
    return entry.name.endsWith('.controller.ts') ? [target] : [];
  });
}

function decorators(node, source) {
  return (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []).map(
    (decorator) => decorator.expression.getText(source),
  );
}

function isHttpHandler(decorator) {
  return /^(Get|Post|Put|Patch|Delete|Options|Head|All)\(/.test(decorator);
}

const failures = [];
for (const file of files(sourceRoot)) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  for (const declaration of source.statements) {
    if (!ts.isClassDeclaration(declaration)) continue;
    const classDecorators = decorators(declaration, source);
    if (!classDecorators.some((item) => item.startsWith('Controller('))) {
      continue;
    }

    for (const member of declaration.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const methodDecorators = decorators(member, source);
      if (!methodDecorators.some(isHttpHandler)) continue;

      const contract = [...classDecorators, ...methodDecorators].join(' ');
      const operation = `${path.relative(
        path.join(__dirname, '..'),
        file,
      )}:${declaration.name?.text ?? '<anonymous>'}.${member.name.getText(source)}`;
      const hasGuard = contract.includes('UseGuards(');
      const isPublic = contract.includes('PublicEndpoint(');
      const isExternal = contract.includes('ExternallyAuthenticatedEndpoint(');
      const isAuthenticationOnly = contract.includes(
        'AuthenticationOnlyEndpoint(',
      );
      const hasJwt = contract.includes('JwtAuthGuard');
      const hasTenantAuthorization = contract.includes('PermissionsGuard');
      const hasPlatformAuthorization = contract.includes(
        'PlatformPermissionsGuard',
      );

      if (!hasGuard && !isPublic && !isExternal) {
        failures.push(`${operation} has no declared access policy`);
      }
      if (
        hasJwt &&
        !hasTenantAuthorization &&
        !hasPlatformAuthorization &&
        !isAuthenticationOnly
      ) {
        failures.push(
          `${operation} relies on authentication alone without an explicit authentication-only classification`,
        );
      }
      if (isAuthenticationOnly && !hasJwt) {
        failures.push(
          `${operation} is authentication-only but has no JwtAuthGuard`,
        );
      }
      if ((hasTenantAuthorization || hasPlatformAuthorization) && !hasJwt) {
        failures.push(
          `${operation} declares user authorization without JwtAuthGuard`,
        );
      }
      if ((isPublic || isExternal) && hasJwt) {
        failures.push(
          `${operation} declares contradictory public and JWT access policies`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`${failures.length} controller access contract violation(s)`);
  process.exitCode = 1;
} else {
  console.log(
    'Every Shield Core controller operation has an explicit, non-contradictory access contract.',
  );
}
