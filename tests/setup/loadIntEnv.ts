import path from 'node:path';
import fs from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

(() => {
  try {
    const repoRoot = path.resolve(__dirname, '../..');
    const intEnvPath = path.resolve(repoRoot, '.int.env');
    if (fs.existsSync(intEnvPath)) {
      dotenvConfig({ path: intEnvPath, override: true });
    }
  } catch {
    // best-effort; worker will proceed with existing env
  }
})();
