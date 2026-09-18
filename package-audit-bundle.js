const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Packaging Docs and Infrastructure bundle for external audit verification...');

const rootDir = __dirname;
const outputZip = path.resolve(rootDir, 'docs_and_infrastructure.zip');

const itemsToInclude = [
  path.join(rootDir, 'docs'),
  path.join(rootDir, 'infrastructure'),
  path.join(rootDir, 'docker-compose.yml'),
  path.join(rootDir, '.env.example'),
  path.join(rootDir, 'g0_specs.txt'),
  path.join(rootDir, 'README.md'),
  path.join(rootDir, '.github'),
];

const itemsStr = itemsToInclude
  .filter((p) => {
    const exists = fs.existsSync(p);
    console.log(`Checking [${exists ? 'EXISTS' : 'MISSING'}]: ${p}`);
    return exists;
  })
  .map((p) => `'${p}'`)
  .join(', ');

if (fs.existsSync(outputZip)) {
  fs.unlinkSync(outputZip);
}

const psCmd = `powershell -Command "Compress-Archive -Path ${itemsStr} -DestinationPath '${outputZip}' -Force"`;
console.log(`Executing: ${psCmd}`);

try {
  execSync(psCmd, { stdio: 'inherit' });
  const stat = fs.statSync(outputZip);
  console.log(`✔ Created docs_and_infrastructure.zip (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
} catch (err) {
  console.error('Packaging failed:', err);
  process.exit(1);
}
