
import { TestProject } from "vitest/dist/node.js";

export function setEnv(project: TestProject, key: string, value: string) {  
  process.env[key] = value;
  project.provide(key as unknown, value);
}

