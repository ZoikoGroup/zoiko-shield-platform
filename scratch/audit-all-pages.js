// Static hazard audit for frontend/src/app
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '../frontend/src/app');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      walk(full, fileList);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      fileList.push(full);
    }
  }
  return fileList;
}

const files = walk(APP_DIR);
console.log(`Found ${files.length} source files in app/ to audit.\n`);

const dangerousPatterns = [
  { name: 'Unsafe Object.values/keys/entries', regex: /Object\.(values|keys|entries)\(([a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+)\)/g },
  { name: 'Unsafe slice on property', regex: /([a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+)\.slice\(/g },
  { name: 'Unsafe map on property', regex: /([a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+)\.map\(/g },
  { name: 'Unsafe toLowerCase on property', regex: /([a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+)\.toLowerCase\(/g },
];

let totalHits = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(path.join(__dirname, '../frontend'), file);

  const findings = [];
  lines.forEach((line, idx) => {
    // skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    for (const pat of dangerousPatterns) {
      if (pat.regex.test(line)) {
        // Check if optional chaining is present
        if (!line.includes('?.') && !line.includes('|| []') && !line.includes('|| {}') && !line.includes('&&')) {
          findings.push({ lineNum: idx + 1, pattern: pat.name, text: line.trim() });
        }
      }
    }
  });

  if (findings.length > 0) {
    console.log(`[FILE] ${relPath}`);
    findings.slice(0, 10).forEach(f => {
      console.log(`  Line ${f.lineNum}: [${f.pattern}] ${f.text.slice(0, 80)}`);
    });
    totalHits += findings.length;
    console.log('');
  }
}

console.log(`Audit complete. Found ${totalHits} potential spots to review.`);
