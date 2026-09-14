// Minimal ambient types for Bun's test runner so `bun run typecheck`
// (plain `tsc --noEmit`, without the `bun-types` package) stays green.
// Covers only the matchers used in this folder.
declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toBeNull(): void;
    toContain(expected: unknown): void;
    not: {
      toBe(expected: unknown): void;
    };
  };
}
