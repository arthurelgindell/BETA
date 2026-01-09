---
description: Run parallel code review with multiple agents
allowed-tools:
  - Task
  - Read
  - Glob
  - Grep
---

# Parallel Code Review

Launch multiple review agents in parallel to analyze the specified files or changes.

## Usage
/parallel-review [file or directory]

## Arguments
$ARGUMENTS

## Execution Strategy

Run these agents **concurrently** (leverage M3 Ultra's 32 cores):

1. **Code Reviewer Agent** - Quality analysis
   - Code smells and anti-patterns
   - Naming conventions
   - Error handling
   - Best practices

2. **Security Scanner Agent** - Vulnerability check
   - OWASP Top 10
   - Secret detection
   - Dependency issues

3. **Performance Analyzer Agent** - Optimization opportunities
   - Algorithm complexity
   - Memory usage
   - Database queries

## Output

Aggregate results into a unified report with:
- Executive summary
- Critical issues (must fix)
- High priority items
- Recommendations
- Code examples for fixes

## Example
```
/parallel-review src/api/
/parallel-review src/components/UserForm.tsx
```
