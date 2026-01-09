# Workflow Rules

## Before Coding
1. Read relevant existing code first
2. Use `/plan` for features > 50 lines
3. Create failing tests for TDD approach
4. Check for existing utilities/helpers
5. Consider edge cases upfront

## During Coding
1. One logical change per commit
2. Run tests after each significant change
3. Use subagents for parallel work
4. Keep commits atomic and focused
5. Write tests alongside implementation

## After Coding
1. Self-review all changes
2. Run full test suite
3. Update documentation if needed
4. Clean up any debug code
5. Verify no secrets committed

## Git Commit Messages
Format: `<type>(<scope>): <description>`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

Example: `feat(auth): add JWT refresh token support`

## Code Review Checklist
- [ ] Tests pass
- [ ] No linting errors
- [ ] No security vulnerabilities
- [ ] Documentation updated
- [ ] No debug code left
- [ ] Error handling appropriate
- [ ] Performance considered

## Branch Strategy
- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `refactor/*` - Code improvements
- `docs/*` - Documentation updates
