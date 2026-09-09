/**
 * Monorepo Packaging Script
 * 
 * Archives the entire ZoikoShield platform monorepo (backend, frontend, infrastructure, docs, docker-compose)
 * into a single canonical zip distribution ('zoikoshield-platform.zip') excluding temporary caches,
 * dist folders, node_modules, and git history.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

async function main() {
  console.log('========================================================================');
  console.log(' 📦 ZoikoShield Full-Monorepo Archive Packager');
  console.log('========================================================================\n');

  const rootDir = path.resolve(__dirname, '../../');
  const targetZip = path.join(rootDir, 'zoikoshield-platform.zip');

  console.log(`Workspace Root: ${rootDir}`);
  console.log(`Target Archive: ${targetZip}\n`);

  // Verify essential top-level trees exist
  const requiredSubtrees = [
    'backend',
    'frontend',
    'infrastructure',
    'docs',
    'docker-compose.yml',
  ];

  for (const item of requiredSubtrees) {
    const fullPath = path.join(rootDir, item);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing required monorepo component: ${item}`);
      process.exit(1);
    }
    const stat = fs.statSync(fullPath);
    console.log(`  ✓ Found ${stat.isDirectory() ? 'directory' : 'file'}: ${item}`);
  }

  // Remove existing zip if present
  if (fs.existsSync(targetZip)) {
    console.log(`\nRemoving previous archive: ${targetZip}`);
    fs.unlinkSync(targetZip);
  }

  console.log('\n[1/3] Packaging full monorepo into zoikoshield-platform.zip...');

  // Use PowerShell Compress-Archive or tar on Windows
  const excludePatterns = [
    'node_modules',
    'dist',
    '.next',
    '.git',
    'coverage',
    '*.zip',
    '.turbo',
    '.system_generated',
  ];

  // We can construct a clean staging copy or use PowerShell with filtering
  const stageDir = path.join(rootDir, 'backend', 'dist', 'staging-monorepo');
  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stageDir, { recursive: true });

  function copyRecursive(src: string, dest: string) {
    const base = path.basename(src);
    if (
      base === 'node_modules' ||
      base === 'dist' ||
      base === '.next' ||
      base === '.git' ||
      base === 'coverage' ||
      base === '.turbo' ||
      base === '.system_generated' ||
      base.endsWith('.zip')
    ) {
      return;
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src);
      for (const entry of entries) {
        copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  console.log('[2/3] Assembling staging directory with filtered subtrees...');
  const itemsToCopy = [
    'backend',
    'frontend',
    'infrastructure',
    'docs',
    'docker-compose.yml',
    '.env.example',
    '.gitignore',
    'README.md',
    'g0_specs.txt',
  ];

  for (const item of itemsToCopy) {
    const srcPath = path.join(rootDir, item);
    if (fs.existsSync(srcPath)) {
      copyRecursive(srcPath, path.join(stageDir, item));
    }
  }

  console.log('[3/3] Compressing staging directory to zoikoshield-platform.zip...');
  try {
    // PowerShell compression from stage directory
    execSync(
      `powershell -Command "Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${targetZip}' -CompressionLevel Optimal"`,
      { stdio: 'inherit' },
    );
  } finally {
    // Clean up staging folder
    if (fs.existsSync(stageDir)) {
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
  }

  if (fs.existsSync(targetZip)) {
    const stat = fs.statSync(targetZip);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log('\n========================================================================');
    console.log(`✅ Full Monorepo Archive Generated Successfully!`);
    console.log(`   Archive: ${targetZip}`);
    console.log(`   Size:    ${sizeMb} MB`);
    console.log('========================================================================\n');
  } else {
    console.error('❌ Failed to produce zoikoshield-platform.zip');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error in package-monorepo-archive:', err);
  process.exit(1);
});
