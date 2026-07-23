/**
 * Validation Script for DissertationPage Component
 * Run with: node tests/validate-dissertation-page.js
 */

import { existsSync, readFileSync } from 'node:fs';

console.log('🔍 Validating DissertationPage Component...\n');

// Check required files exist
const requiredFiles = [
  'frontend/components/DissertationPage.js',
  'frontend/components/MindMap.js',
  'frontend/components/DetailPanel.js',
  'frontend/components/dissertationData.js',
  'frontend/design-system/tokens.css',
  'frontend/index.css',
  'frontend/html.js'
];

let allFilesExist = true;

console.log('📁 Checking Required Files:');
requiredFiles.forEach(file => {
  const exists = existsSync(file);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

if (!allFilesExist) {
  console.error('\n❌ Some required files are missing!');
  process.exit(1);
}

// Read the component and the presentation/accessibility collaborators it owns.
const dissertationPagePath = 'frontend/components/DissertationPage.js';
const content = readFileSync(dissertationPagePath, 'utf-8');
const mindMap = readFileSync('frontend/components/MindMap.js', 'utf-8');
const detailPanel = readFileSync('frontend/components/DetailPanel.js', 'utf-8');
const styles = readFileSync('frontend/index.css', 'utf-8');

// Validation checks
const checks = [
  {
    name: 'Uses archive design-system recipes and semantic tokens',
    test: content.includes('archive-action archive-action--')
      && styles.includes('.archive-dissertation-route')
      && styles.includes('var(--archive-'),
    critical: true
  },
  {
    name: 'Keeps archive orientation and route-entry focus',
    test: content.includes('aria-label="Back to archive"')
      && content.includes('data-route-entry-focus')
      && content.includes("Jay Rosen's Internet Archive"),
    critical: false
  },
  {
    name: 'Has an accessible interactive-map region',
    test: content.includes('aria-label="Dissertation index terms"')
      && mindMap.includes('aria-roledescription="interactive mind map"')
      && mindMap.includes('aria-live="polite"'),
    critical: false
  },
  {
    name: 'Has an accessible detail dialog',
    test: detailPanel.includes('role="dialog"')
      && detailPanel.includes('aria-labelledby="detail-panel-title"')
      && detailPanel.includes('aria-label="Close detail panel"'),
    critical: true
  },
  {
    name: 'Has keyboard shortcuts',
    test: mindMap.includes('handleKeyDown')
      && mindMap.includes('aria-label="Show keyboard shortcuts"'),
    critical: false
  },
  {
    name: 'Integrates with MindMap',
    test: content.includes('<${MindMap}') && content.includes('onNodeSelect'),
    critical: true
  },
  {
    name: 'Integrates with DetailPanel',
    test: content.includes('<${DetailPanel}') && content.includes('isOpen'),
    critical: true
  },
  {
    name: 'Has responsive design',
    test: styles.includes('@media (max-width: 720px)')
      && styles.includes('.archive-dissertation-intro__layout'),
    critical: false
  }
];

console.log('\n🧪 Running Validation Checks:');

let passedCritical = 0;
let totalCritical = 0;
let passedOptional = 0;
let totalOptional = 0;

checks.forEach(check => {
  const passed = check.test;
  const icon = passed ? '✅' : (check.critical ? '❌' : '⚠️');
  console.log(`  ${icon} ${check.name} ${check.critical ? '[CRITICAL]' : '[OPTIONAL]'}`);

  if (check.critical) {
    totalCritical++;
    if (passed) passedCritical++;
  } else {
    totalOptional++;
    if (passed) passedOptional++;
  }
});

// Count design token usage
const tokenCount = (styles.match(/var\(--archive-/g) || []).length;
console.log(`\n📊 Design System Integration:`);
console.log(`  Design tokens used: ${tokenCount} times`);
console.log(`  File size: ${(content.length / 1024).toFixed(2)} KB`);
console.log(`  Lines of code: ${content.split('\n').length}`);

// Summary
console.log('\n📈 Validation Summary:');
console.log(`  Critical checks: ${passedCritical}/${totalCritical} passed`);
console.log(`  Optional checks: ${passedOptional}/${totalOptional} passed`);

if (passedCritical === totalCritical) {
  console.log('\n✅ ALL CRITICAL CHECKS PASSED! Component is ready for integration.');
  process.exit(0);
} else {
  console.log('\n❌ Some critical checks failed. Please review the component.');
  process.exit(1);
}
