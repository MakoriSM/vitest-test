import { describe as vDescribe, it as vIt, expect as vExpect } from "vitest";


vDescribe("basic infra smoke", () => {
  vIt("sets DATABASE_URL for per-file db", () => {
    const url = process.env.DATABASE_URL;
    vExpect(url).toBeTruthy();
    vExpect(url!).toMatch(/vt_/);
    vExpect(process.env.DATABASE_URL).toBe(url);
  });
});