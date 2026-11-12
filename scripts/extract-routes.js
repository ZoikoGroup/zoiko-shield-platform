const fs = require('fs');
const path = require('path');

const routes = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (f.endsWith('.controller.ts')) {
      const content = fs.readFileSync(p, 'utf8');
      const cMatch = content.match(/@Controller\((?:['"]|\[['"])([^'"\]]+)/);
      const base = cMatch ? cMatch[1] : '';
      const mMatches = content.matchAll(/@(Get|Post|Put|Patch|Delete)\((?:['"]|\[['"])?([^'"\]]*)/g);
      for (const m of mMatches) {
        let sub = m[2] ? '/' + m[2].replace(/^\//, '') : '';
        if (sub.includes(')')) sub = sub.split(')')[0];
        let fullPath = ('/' + base + sub).replace(/\/+/g, '/').replace(/\/$/, '');
        if (!fullPath.startsWith('/')) fullPath = '/' + fullPath;
        routes.push({
          method: m[1].toUpperCase(),
          path: fullPath,
          file: path.relative(process.cwd(), p).replace(/\\/g, '/'),
        });
      }
    }
  }
}

walk('backend/apps/shield-core/src');
console.log('Total routes found:', routes.length);
fs.writeFileSync('scripts/routes-core.json', JSON.stringify(routes, null, 2));

