# CLI Configuration UI Testing Documentation

This document outlines the testing strategy and structure for the CLI Configuration UI integration.

## Architecture

The CLI Configuration UI is built using a modular approach:
- `CLIConfigSelector`: Main integration component managing state for multiple CLI formats.
- `CommandPreview`: Displays the generated command and validation errors.
- `PermissionFlags`: Manages security-sensitive flags like YOLO mode and sandbox settings.
- `command-builder`: Pure logic library for validating options and building command strings.

## Testing Strategy

### 1. Unit Tests (`web-ui/src/lib/command-builder.test.ts`)
Focuses on the core logic of command generation.
- Validates required fields for each format (e.g., provider/model for OpenCode).
- Ensures correct flag formatting for boolean, string, and numeric values.
- Verifies that agent and profile parameters are correctly injected.

### 2. Component Integration Tests (`web-ui/src/components/cli-config-selector.test.tsx`)
Verifies the interaction between UI components and state management.
- Uses a manual `react-dom/client` approach to match project standards.
- Verifies format switching (OpenCode <-> Gemini <-> Codex).
- Tests model filtering by provider for OpenCode.
- Validates temperature range interaction for Gemini.
- Ensures state is reset correctly when changing providers or formats.
- Verifies that security warnings appear when enabling YOLO mode.

### 3. E2E Tests (`web-ui/tests/e2e/cli-config-workflow.spec.ts`)
Covers the full user journey using Playwright.
- Complete workflow for OpenCode (Select Provider -> Model -> Agent -> Copy).
- Complete workflow for Gemini (Adjust Temperature -> Enable YOLO -> Confirm Warning).
- Complete workflow for Codex (Select Profile -> Approval Policy).
- Verifies persistence and reset logic across interactions.

## How to Run Tests

### Unit & Integration Tests
```bash
cd web-ui
npm test src/lib/command-builder.test.ts src/components/cli-config-selector.test.tsx
```

### E2E Tests
```bash
cd web-ui
npx playwright test tests/e2e/cli-config-workflow.spec.ts
```

## Mocking
The components currently use internal mock data for providers, models, and profiles. In a production environment, these should be replaced by calls to `runtime-config-query.ts` or custom hooks.
