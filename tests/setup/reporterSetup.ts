import globalSetup from './globalSetup';
import { Reporter,BasicReporter } from 'vitest/reporters';
import globalTeardown from './globalTeardown';

export default class CustomReporter implements Reporter {
	async onTestRunStart() {
		console.log('CustomReporter: onTestRunStart');
		await setup();
	}
	async onWatcherRerun() {
		console.log('CustomReporter: onWatcherRerun');
		await setup();
	}
	async onFinished() {
		console.log('CustomReporter: onTestRunEnd');
		await teardown();
	}
}

async function setup(){
    process.env.NODE_ENV = 'test';
    process.env.TEST_SUITE = 'int-auth';
    process.env.AUTH_PROVIDER = 'firebase';
    process.env.FIREBASE_AUTH_EMULATOR = 'true';
    process.env.FIREBASE_PROJECT_ID = 'demo-test';
    process.env.REQUIRE_DB = 'true';
    process.env.REQUIRE_S3 = 'true';
	// This does not work because the project is not available in the reporter setup, ideally we would just use process env variables as they can be reached in this context unlike with globalSetup.
    await globalSetup(project, true, true, true);
}

async function teardown(){
    await globalTeardown();
}