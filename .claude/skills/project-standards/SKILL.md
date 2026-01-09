---
description: Enforces project coding standards and patterns
user-invocable: false
---

# Project Standards Skill

This skill automatically enforces project-specific standards when Claude generates or modifies code.

## Activation Triggers
- New file creation
- Code generation requests
- Refactoring tasks
- API endpoint creation
- Component development

## Standards Applied

### 1. Coding Standards
Follow rules from @.claude/rules/coding-standards.md:
- TypeScript for new code
- Functional patterns preferred
- Proper naming conventions
- Maximum function/file lengths

### 2. Security Rules
Apply rules from @.claude/rules/security-rules.md:
- No hardcoded secrets
- Input validation
- Secure authentication patterns
- Dependency security

### 3. Workflow Rules
Use rules from @.claude/rules/workflow-rules.md:
- Proper commit messages
- Test-driven development
- Documentation updates

## Automatic Actions

### When Creating Functions
- Suggest corresponding unit tests
- Add JSDoc/TSDoc comments
- Validate error handling

### When Creating API Endpoints
- Suggest input validation
- Add authentication checks
- Create OpenAPI documentation

### When Creating Components
- Suggest component tests
- Add prop type definitions
- Consider accessibility

## Platform Optimization
- Recommend parallel processing for batch operations (M3 Ultra: 32 cores)
- Suggest appropriate caching strategies
- Consider memory-efficient patterns (256GB available but be efficient)
