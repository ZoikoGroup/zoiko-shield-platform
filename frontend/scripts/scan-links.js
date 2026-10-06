const fs = require('fs');
const path = require('path');

function getAllLinks(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllLinks(fullPath));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      const code = fs.readFileSync(fullPath, 'utf8');
      const hrefMatches = code.matchAll(/href=["'](\/[^"']*)["']/g);
      for (const m of hrefMatches) {
        results.push({ file: fullPath, href: m[1] });
      }
      const routerPushMatches = code.matchAll(/router\.push\(["'](\/[^"']*)["']\)/g);
      for (const m of routerPushMatches) {
        results.push({ file: fullPath, href: m[1] });
      }
    }
  }
  return results;
}

const allLinks = getAllLinks(path.resolve(__dirname, '../src'));
const uniqueHrefs = [...new Set(allLinks.map(l => l.href.split('?')[0].split('#')[0]))];

console.log('Total unique static hrefs found:', uniqueHrefs.length);

const basePath = path.resolve(__dirname, '../src/app');
const broken = [];
const working = [];

for (const href of uniqueHrefs) {
  if (href.startsWith('/api/')) continue;
  const rel = href.replace(/^\/+/, '');
  const targetPage = rel === '' ? path.join(basePath, 'page.tsx') : path.join(basePath, rel, 'page.tsx');
  
  if (fs.existsSync(targetPage)) {
    working.push(href);
    continue;
  }

  // Check dynamic routes
  const parts = rel.split('/').filter(Boolean);
  let current = basePath;
  let found = true;
  for (const part of parts) {
    if (fs.existsSync(path.join(current, part))) {
      current = path.join(current, part);
    } else {
      const sub = fs.existsSync(current) ? fs.readdirSync(current) : [];
      const dynamic = sub.find(s => s.startsWith('[') && s.endsWith(']'));
      if (dynamic) {
        current = path.join(current, dynamic);
      } else {
        found = false;
        break;
      }
    }
  }
  if (found && fs.existsSync(path.join(current, 'page.tsx'))) {
    working.push(href);
  } else {
    // Find where it is referenced
    const refs = allLinks.filter(l => l.href.split('?')[0].split('#')[0] === href).map(l => path.relative(path.resolve(__dirname, '../src'), l.file));
    broken.push({ href, refs: [...new Set(refs)] });
  }
}

console.log('\n--- BROKEN / MISSING ROUTES (' + broken.length + ') ---');
for (const b of broken) {
  console.log(`❌ ${b.href}`);
  console.log(`   Referenced in: ${b.refs.join(', ')}`);
}

console.log('\n--- WORKING ROUTES (' + working.length + ') ---');
console.log(working.sort().join('\n'));
