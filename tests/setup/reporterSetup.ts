
import type { Reporter } from "vitest";
import globalTeardown from "./globalTeardown";

export default class CustomReporter implements Reporter {
  async onInit() {
    console.log("CustomReporter: onInit");
    // no-op; containers are initialized lazily by tests/setup/workerDb.ts
  }
  async onFinished() {
    console.log("CustomReporter: onTestRunEnd");
    await teardown();
  }
}

async function teardown() {
  await globalTeardown();
}
