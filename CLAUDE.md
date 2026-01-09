# ARTHUR Project - Claude Code Memory

## Project Identity
- **Name**: ARTHUR
- **Location**: /Volumes/CLAUDE/ARTHUR
- **Purpose**: Multi-purpose development workspace
- **Primary Focus**: Web Applications, API/Backend Services, General Development
- **Secondary**: Data/ML Pipelines (as needed)

## System Context
- **Hardware**: Mac Studio M3 Ultra (32 cores, 256GB RAM)
- **OS**: macOS 26.2 (Tahoe)
- **Claude Code**: v2.1.1

## Critical Rules

### ISOLATION RULES (HIGHEST PRIORITY)
- This project is COMPLETELY ISOLATED from other Claude Code instances
- NEVER reference or inherit configurations from ~/.claude/ unless explicitly allowed
- All project-specific settings MUST be in .claude/ within this folder
- Do NOT modify user-level (~/) Claude Code configurations

### Performance Optimization
- Leverage parallel subagents extensively (system supports 10+ concurrent)
- Use background tasks (Ctrl+B) for long-running operations
- Maximum context utilization is encouraged given 256GB RAM

### Workflow Standards
- Always use `/plan` before complex implementations
- Run `/clear` between distinct tasks
- Use checkpoint system (double-Esc) before risky operations
- Prefer `ultrathink` for architectural decisions

## Common Commands

### Web Development
- `npm install` / `pnpm install` - Install dependencies
- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm test` - Run test suite
- `npm run lint` - Run linter
- `npx tsc --noEmit` - TypeScript type check

### API/Backend
- `npm run start:dev` - Development server with hot reload
- `npm run start:prod` - Production mode
- `docker-compose up -d` - Start containerized services
- `curl -X GET http://localhost:3000/health` - Health check

### Database
- `npx prisma migrate dev` - Run Prisma migrations
- `npx prisma studio` - Open Prisma Studio
- `npm run db:seed` - Seed database

### Git Workflow
- Branch naming: `feature/`, `fix/`, `refactor/`, `docs/`
- Commit format: Conventional Commits
- Always include Co-Authored-By for AI-assisted commits

## Import Additional Context
@.claude/rules/coding-standards.md
@.claude/rules/security-rules.md
@.claude/rules/workflow-rules.md
