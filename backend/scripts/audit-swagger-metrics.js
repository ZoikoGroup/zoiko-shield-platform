const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const swaggerPath = path.join(__dirname, '..', '..', 'docs', 'swagger.yaml');
console.log('Loading Swagger specification from:', swaggerPath);

const raw = fs.readFileSync(swaggerPath, 'utf8');
const spec = yaml.load(raw);

const paths = Object.keys(spec.paths || {});
let operationsCount = 0;
const methodCounts = {};
const tagsMap = {};
const statusCodes = {};
let operationsWithParams = 0;
let operationsWithResponses = 0;
let operationsWithRequestBody = 0;
let operationsWithSecurity = 0;

for (const p of paths) {
  const pathItem = spec.paths[p];
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
    if (!pathItem[m]) continue;
    operationsCount++;
    methodCounts[m] = (methodCounts[m] || 0) + 1;
    const op = pathItem[m];
    
    if (op.parameters && op.parameters.length > 0) operationsWithParams++;
    if (op.requestBody) operationsWithRequestBody++;
    if (op.security && op.security.length > 0) operationsWithSecurity++;
    
    if (op.responses) {
      operationsWithResponses++;
      for (const code of Object.keys(op.responses)) {
        statusCodes[code] = (statusCodes[code] || 0) + 1;
      }
    }
    
    for (const t of (op.tags || ['Untagged'])) {
      tagsMap[t] = (tagsMap[t] || 0) + 1;
    }
  }
}

const schemas = Object.keys(spec.components?.schemas || {});
const parameters = Object.keys(spec.components?.parameters || {});
const securitySchemes = Object.keys(spec.components?.securitySchemes || {});
const responses = Object.keys(spec.components?.responses || {});

console.log('\n================================================================');
console.log('         ZOIKOSHIELD SWAGGER / OPENAPI 3.0.3 AUDIT REPORT');
console.log('================================================================');
console.log('OpenAPI Specification Version :', spec.openapi);
console.log('API Title                     :', spec.info.title);
console.log('API Release Version           :', spec.info.version);
console.log('Total Line Count (YAML)       :', raw.split('\n').length.toLocaleString());
console.log('Total File Size               :', (Buffer.byteLength(raw, 'utf8') / 1024 / 1024).toFixed(2), 'MB');
console.log('----------------------------------------------------------------');
console.log('API Surface Metrics:');
console.log('  Total Unique Path Items     :', paths.length);
console.log('  Total Operations (Endpoints):', operationsCount);
console.log('  Operations with Parameters  :', operationsWithParams);
console.log('  Operations with RequestBody :', operationsWithRequestBody);
console.log('  Operations with Security    :', operationsWithSecurity);
console.log('  Operations with Responses   :', operationsWithResponses);
console.log('\nOperations by HTTP Method:');
for (const [m, count] of Object.entries(methodCounts)) {
  console.log(`  ${m.toUpperCase().padEnd(8)}: ${count}`);
}
console.log('\nComponent Definitions:');
console.log('  Schema Models (DTOs)        :', schemas.length);
console.log('  Reusable Parameters         :', parameters.length);
console.log('  Reusable Responses          :', responses.length);
console.log('  Security Schemes            :', securitySchemes.join(', '));
console.log('\nTagged Modules (' + Object.keys(tagsMap).length + ' Functional Tags):');
Object.entries(tagsMap)
  .sort((a, b) => b[1] - a[1])
  .forEach(([tag, count]) => {
    console.log(`  - ${tag.padEnd(28)}: ${count} endpoints`);
  });

console.log('\nResponse Status Code Frequency:');
Object.entries(statusCodes)
  .sort((a, b) => b[1] - a[1])
  .forEach(([code, count]) => {
    console.log(`  HTTP ${code.padEnd(5)}: ${count} declarations`);
  });
console.log('================================================================\n');
