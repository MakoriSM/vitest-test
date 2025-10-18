import { inject, ProvidedContext } from "vitest";

export function getEnv(key: string) {
  const value = inject(key as keyof ProvidedContext) as string | undefined;
  console.log('getEnv:', key, value);
  return value;
}