// Simple test to validate template functionality
const assert = require('assert');

// Since we can't import TypeScript directly in JS, we'll test the compiled output
try {
  const { BUILT_IN_TEMPLATES, processTemplate } = require('../out/templates');
  const { TEMPLATE_TYPES } = require('../out/types');

  console.log('Testing Template Functionality...\n');

  // Test 1: Check that built-in templates exist
  console.log('Test 1: Built-in templates exist');
  assert(BUILT_IN_TEMPLATES.length === 3, 'Should have 3 built-in templates');
  console.log('✓ Found', BUILT_IN_TEMPLATES.length, 'built-in templates\n');

  // Test 2: Check template structure
  console.log('Test 2: Template structure validation');
  BUILT_IN_TEMPLATES.forEach(template => {
    assert(template.id, `Template should have an id`);
    assert(template.name, `Template ${template.id} should have a name`);
    assert(template.description, `Template ${template.id} should have a description`);
    assert(template.template, `Template ${template.id} should have a template property`);
    console.log(`✓ ${template.name} has valid structure`);
  });
  console.log();

  // Test 3: Test variable substitution
  console.log('Test 3: Variable substitution');
  const bugTemplate = BUILT_IN_TEMPLATES.find(t => t.id === 'bug-report');
  const processedTask = processTemplate(bugTemplate, {
    title: 'Login button not working',
    description: 'Users cannot log in to the application'
  });

  assert(processedTask.title === 'Login button not working', 'Title should be substituted');
  assert(processedTask.description.includes('Users cannot log in'), 'Description should be substituted');
  assert(processedTask.template === 'bug', 'Template type should be set');
  assert(processedTask.priority === 'high', 'Priority should be set from template');
  assert(Array.isArray(processedTask.tags), 'Tags should be an array');
  assert(processedTask.tags.includes('bug'), 'Should have bug tag');
  assert(Array.isArray(processedTask.subtasks), 'Should have subtasks');
  assert(processedTask.subtasks.length > 0, 'Should have at least one subtask');
  console.log('✓ Variable substitution works correctly\n');

  // Test 4: Test template types
  console.log('Test 4: Template types');
  assert(TEMPLATE_TYPES.BUG === 'bug', 'BUG type should be "bug"');
  assert(TEMPLATE_TYPES.FEATURE === 'feature', 'FEATURE type should be "feature"');
  assert(TEMPLATE_TYPES.REFACTOR === 'refactor', 'REFACTOR type should be "refactor"');
  console.log('✓ Template types are correct\n');

  // Test 5: Validate each template's variables
  console.log('Test 5: Template variables validation');
  BUILT_IN_TEMPLATES.forEach(template => {
    assert(Array.isArray(template.variables), `${template.name} should have variables array`);
    template.variables.forEach(variable => {
      assert(variable.name, `Variable in ${template.name} should have a name`);
      assert(variable.description, `Variable ${variable.name} should have a description`);
    });
    console.log(`✓ ${template.name} has valid variables`);
  });
  console.log();

  console.log('🎉 All tests passed!\n');

  // Display template summary
  console.log('Template Summary:');
  console.log('=================');
  BUILT_IN_TEMPLATES.forEach(template => {
    console.log(`\n${template.name} (${template.id})`);
    console.log(`  Description: ${template.description}`);
    console.log(`  Template Type: ${template.template.template}`);
    console.log(`  Priority: ${template.template.priority}`);
    console.log(`  Subtasks: ${template.template.subtasks ? template.template.subtasks.length : 0}`);
    console.log(`  Variables: ${template.variables.map(v => v.name).join(', ')}`);
  });

} catch (error) {
  console.error('Test failed:', error.message);
  console.error('\nMake sure to run "npm run compile" first to build the TypeScript files.');
  process.exit(1);
}