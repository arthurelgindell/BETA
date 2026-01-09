---
description: Fast fix for simple issues
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
---

# Quick Fix

Rapidly fix simple, isolated issues without extensive planning.

## Usage
/quick-fix [description of issue]

## Arguments
$ARGUMENTS

## Appropriate For
- Linting errors
- Type errors
- Missing imports
- Simple typos
- Formatting issues
- Small refactors (< 20 lines)
- Adding missing null checks
- Simple bug fixes

## NOT Appropriate For
- Architectural changes
- Security vulnerability fixes
- Complex refactors
- Multi-file changes
- Performance optimizations
- New feature implementation

Use `/plan` for complex changes instead.

## Process
1. Identify the issue
2. Read affected file(s)
3. Make minimal fix
4. Run relevant tests (if available)
5. Report what was changed

## Example
```
/quick-fix unused import in src/utils/helpers.ts
/quick-fix type error on line 42 of UserForm.tsx
/quick-fix missing await in fetchData function
```
