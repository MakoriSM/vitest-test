// Re-export the existing setup/teardown so Vitest's setupFiles can import a single module if desired.
export { default as globalSetup } from './globalSetup';
export { default as globalTeardown } from './globalTeardown';
