import { TestProject } from "vitest/dist/node.js";
import { globalTeardown } from "./global";

export default async function teardown(project: TestProject) {
    console.log('vitest-teardown.global.int.ts: teardown');
    return async () => {
        console.log('vitest-teardown.global.int.ts: teardown');
        await globalTeardown();
    }
  }