/**
 * Validation Script for DissertationPage Component
 * Run with: node validate-dissertation-page.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating DissertationPage Component...\n');

// Check required files exist
const requiredFiles = [
  'frontend/components/DissertationPage.js',
  'frontend/components/MindMap.js',
  'frontend/components/DetailPanel.js',
  'frontend/components/dissertationData.js',
  'frontend/design-system/tokens.css',
  'frontend/html.js'
];

let allFilesExist = true;

console.log('📁 Checking Required Files:');
requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

if (!allFilesExist) {
  console.error('\n❌ Some required files are missing!');
  process.exit(1);
}

// Read DissertationPage.js
const dissertationPagePath = 'frontend/components/DissertationPage.js';
const content = fs.readFileSync(dissertationPagePath, 'utf-8');

// Validation checks
const checks = [
  {
    name: 'Uses design system tokens',
    test: content.includes('var(--color-') && content.includes('var(--space-'),
    critical: true
  },
  {
    name: 'Has breadcrumb navigation',
    test: content.includes('breadcrumbs') && content.includes('aria-label="Breadcrumb navigation"'),
    critical: false
  },
  {
    name: 'Has loading state',
    test: content.includes('isLoading') && content.includes('Loading dissertation'),
    critical: false
  },
  {
    name: 'Has accessibility features',
    test: content.includes('aria-label') && content.includes('role="status"'),
    critical: true
  },
  {
    name: 'Has keyboard shortcuts',
    test: content.includes('handleKeyDown') && content.includes('Cmd/Ctrl'),
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
    test: content.includes('className="hidden') || content.includes('hide-mobile'),
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
const tokenCount = (content.match(/var\(--/g) || []).length;
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
