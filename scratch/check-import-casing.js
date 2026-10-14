// Script to check case-sensitive import paths across backend
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', 'backend');

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
        walk(full, fileList);
      }
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      fileList.push(full);
    }
  }
  return fileList;
}

// Map real files on disk with their exact casing
function getActualCasing(targetPath) {
  const parts = path.resolve(targetPath).split(path.sep);
  let current = parts[0] ? parts[0] + path.sep : path.sep;
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    if (!segment) continue;
    try {
      const items = fs.readdirSync(current);
      const match = items.find(item => item.toLowerCase() === segment.toLowerCase());
      if (!match) return null; // File doesn't exist
      if (match !== segment) {
        return { expected: segment, actual: match, fullPath: path.join(current, match) };
      }
      current = path.join(current, match);
    } catch (e) {
      return null;
    }
  }
  return null; // Exact match
}

const files = walk(BACKEND_DIR);
console.log(`Auditing ${files.length} TypeScript files in backend for case-sensitive import mismatches...\n`);

const importRegex = /(?:import|export)\s+(?:(?:[\s\S]*?from\s+)?['"]([^'"]+)['"])/g;

let mismatches = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith('.')) continue; // skip packages
    
    const fileDir = path.dirname(file);
    let resolved = path.resolve(fileDir, importPath);
    
    // Check if it's a file with .ts extension or /index.ts
    let target = null;
    if (fs.existsSync(resolved + '.ts')) {
      target = resolved + '.ts';
    } else if (fs.existsSync(path.join(resolved, 'index.ts'))) {
      target = path.join(resolved, 'index.ts');
    } else if (fs.existsSync(resolved)) {
      target = resolved;
    }
    
    if (target) {
      const caseIssue = getActualCasing(target);
      if (caseIssue) {
        console.log(`[CASE MISMATCH] in ${path.relative(BACKEND_DIR, file)}:`);
        console.log(`  Imported: "${importPath}"`);
        console.log(`  Mismatch: "${caseIssue.expected}" !== actual "${caseIssue.actual}"\n`);
        mismatches++;
      }
    } else {
      console.log(`[MISSING IMPORT] in ${path.relative(BACKEND_DIR, file)}:`);
      console.log(`  Imported: "${importPath}" -> could not resolve to file!\n`);
      mismatches++;
    }
  }
}

console.log(`Audit finished. Total case/missing import issues: ${mismatches}`);
