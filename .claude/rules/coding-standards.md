# Coding Standards

## General
- Use TypeScript for all new code when applicable
- Prefer functional programming patterns
- Maximum function length: 50 lines
- Maximum file length: 500 lines

## Naming Conventions
- Variables: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Functions: camelCase (verbs)
- Classes: PascalCase
- Files: kebab-case
- React Components: PascalCase

## Error Handling
- Always use try-catch for async operations
- Provide meaningful error messages
- Log errors with context
- Use custom error classes for domain errors

## Comments
- Only add comments for non-obvious logic
- Use JSDoc for public APIs
- No commented-out code
- Prefer self-documenting code

## TypeScript Specific
- Prefer `interface` over `type` for object shapes
- Use strict mode
- Avoid `any` - use `unknown` when type is uncertain
- Explicit return types for public functions

## React Specific
- Functional components only (no class components)
- Use hooks appropriately
- Memoize expensive computations
- Keep components focused and small
