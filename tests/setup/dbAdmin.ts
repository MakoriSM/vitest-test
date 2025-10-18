import { execSync } from 'node:child_process';

export function adminUrlFromTemplate(templateUrl: string): string {
  const u = new URL(templateUrl);
  u.pathname = '/postgres';
  return u.toString();
}

export function createDbFromTemplate(
  adminUrl: string,
  dbName: string,
  template = 'vitest_template',
): void {
  try {
    execSync(
      `psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${dbName}\" TEMPLATE ${template}"`,
      { stdio: 'ignore' },
    );
  } catch {
    // exists or cannot create; ignore
  }
}

export function dropDb(adminUrl: string, dbName: string): void {
  try {
    execSync(
      `psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}' AND pid <> pg_backend_pid()"`,
      { stdio: 'ignore' },
    );
    execSync(
      `psql "${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${dbName}\""`,
      { stdio: 'ignore' },
    );
  } catch {
    // best effort; ignore
  }
}

export function dropAllTestDbs(templateUrl?: string): void {
  const baseTemplateUrl = templateUrl ?? process.env.DATABASE_URL!;
  const adminUrl = adminUrlFromTemplate(baseTemplateUrl);

  try {
    const out = execSync(
      `psql "${adminUrl}" -At -c "SELECT datname FROM pg_database WHERE datname LIKE 'vt_%'"`,
    ).toString();
    const names = out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const name of names) dropDb(adminUrl, name);
  } catch {
    // ignore
  }
}



