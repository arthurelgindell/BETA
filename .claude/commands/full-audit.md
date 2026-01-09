---
description: Comprehensive project audit
allowed-tools:
  - Task
  - Read
  - Glob
  - Grep
  - Bash
---

# Full Project Audit

Perform a comprehensive audit of the entire project using all available agents.

## Usage
/full-audit

## Execution Plan

Run **all 6 agents in parallel** for maximum efficiency:

### 1. Code Quality (code-reviewer)
- Scan all source files
- Identify code smells
- Check naming conventions
- Evaluate error handling

### 2. Security (security-scanner)
- OWASP Top 10 vulnerabilities
- Secret/credential detection
- Dependency vulnerability scan
- Security configuration review

### 3. Performance (performance-analyzer)
- Algorithm complexity analysis
- Database query review
- Memory usage patterns
- Caching opportunities

### 4. Tests (test-writer)
- Test coverage analysis
- Missing test identification
- Test quality assessment
- Edge case coverage gaps

### 5. Documentation (documentation-writer)
- README completeness
- API documentation coverage
- Code comment quality
- Missing documentation

### 6. API Design (api-designer)
- REST/GraphQL best practices
- Schema design review
- Endpoint consistency
- Error handling patterns

## Output Format

Generate executive summary with:
- Overall health score (A-F)
- Critical issues count
- Prioritized action items
- Estimated effort for fixes
- Detailed findings by category
