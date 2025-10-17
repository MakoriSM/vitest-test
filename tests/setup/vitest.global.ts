import globalSetup from './globalSetup';
import globalTeardown from './globalTeardown';

export default async function setup() {
  await globalSetup();
  return async () => {
    await globalTeardown();
  };
}
