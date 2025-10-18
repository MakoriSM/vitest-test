### Requirements:
- Docker (desktop or engine)
- npm (Node.js 18+ recommended)
- psql (PostgreSQL client) available on PATH

### What this repo does
Minimum reproducible example demonstrating Vitest workspace projects with Testcontainers (Postgres, LocalStack S3) and Firebase Auth emulator. It runs:
- Postgres in a container and prepares a Prisma template DB per worker
- LocalStack S3 for object storage
- Firebase Auth emulator (only for the auth suite)

### Purpose of this repo
This MRE highlights issues when using the VS Code Vitest extension with workspace projects and Testcontainers:
- Extension runs can behave differently vs CLI, producing issues.
- Testcontainers often do not teardown correctly when launched via the extension, leaving containers running.
- Goal: gather confirmations, bug reports, and feedback to help fix extension behavior and validate this setup.

### My Setup

<details>
  <summary>System</summary>

  - **OS:** Linux 5.15 Ubuntu 20.04 LTS (Focal Fossa)
  - **CPU:** (16) x64 AMD Ryzen 7 5800X 8-Core Processor
  - **Memory:** 9.83 GB / 15.58 GB
  - **Container:** Yes
  - **Shell:** 5.8 - /usr/bin/zsh

</details>

<details>
  <summary>Binaries</summary>

  - **Node:** 24.7.0 
  - **npm:** 11.5.1 
  - **pnpm:** 9.12.3

</details>

<details>
  <summary>npm Packages</summary>

  - **@prisma/client:** ^6.17.1 → 6.17.1 
  - **prisma:** ^6.14.0 → 6.17.1 
  - **typescript:** ^5.6.3 → 5.9.3 
  - **vitest:** ^3.2.4 → 3.2.4 

</details>

<details>
  <summary>npm Global Packages</summary>

  - **corepack:** 0.34.0
  - **npm:** 11.5.1

</details>


<details>
  <summary>Docker</summary>

  - **Client:**
    - Version: 27.2.0
    - API version: 1.47
    - Go version: go1.21.13
    - Git commit: 3ab4256
    - Built: Tue Aug 27 14:14:20 2024
    - OS/Arch: linux/amd64
    - Context: default

  - **Server:** Docker Desktop
    - Engine:
      - Version: 27.2.0
      - API version: 1.47 (min 1.24)
      - Go version: go1.21.13
      - Git commit: 3ab5c7d
      - Built: Tue Aug 27 14:15:15 2024
      - OS/Arch: linux/amd64
      - Experimental: false
    - containerd:
      - Version: 1.7.20
      - Git commit: 8fc6bcff51318944179630522a095cc9dbf9f353
    - runc:
      - Version: 1.1.13
      - Git commit: v1.1.13-0-g58aa920
    - docker-init:
      - Version: 0.19.0
      - Git commit: de40ad0

  - **Images:**
    - postgres: 16-alpine
    - evolutecx/firebase-emulator: latest
    - localstack/localstack: 2.3

</details>



### Quickstart (copy/paste)
1. Install deps
   ```bash
   npm install
   ```
2. Ensure Docker is running (Docker Desktop or dockerd)
3. Run migrations/client generation (on-demand in tests, but safe to pre-run)
   ```bash
   npx prisma generate
   ```
4. Run all tests from CLI (preferred for MRE)
   ```bash
   npx vitest run
   ```
   Or per-project:
   ```bash
   # unit tests only
   npm run test
   
   # integration tests (DB + S3)
   npm run test:int
   
   # integration tests with auth (DB + S3 + Firebase emulator)
   npm run test:int-auth
   ```

### Environment variables
Most env is supposed to be auto-provisioned by global setup:
- DATABASE_URL, SHADOW_DATABASE_URL (auto from Testcontainers)
- R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (auto for LocalStack)
- FIREBASE_PROJECT_ID, FIREBASE_AUTH_EMULATOR (auto for auth suite)
- PUBLIC_BASE_URL (defaults to http://localhost:3000)

### Prisma
- Schema lives in `prisma/schema.prisma`.
- Tests auto-run `prisma generate` if needed and push schema to a template DB that workers clone.
- You can manually run:
  ```bash
  npx prisma generate
  npx prisma db push
  ```

### Running via VS Code Vitest extension
This repo uses a Vitest workspace (`vitest.workspace.ts`) with three projects: `unit`, `int`, `int-auth`.
- Currently globalSetup config uses vitest.global.ts file for global setup. The globalSetup file is what it runs.
- The setupFiles config uses the workerDb service, which creates a unique database for each file to separate db operations for each. This could be removed if it makes testing easier.
- Known issue: When using the extension, Testcontainers frequently fail to teardown, leaving containers running. Prefer CLI for reliable test and teardown.
- Previously attempted to use just globalSetup without an onTestsRerun hook but this would only run first time the repo loads and never again so this was changed.

### How to help (feedback/bug reports wanted)
If you can reproduce extension issues, please share:
- Your OS, Node version, Docker version, VS Code + extension versions.
- Exact command or extension action (file vs folder run), and which project (`unit`/`int`/`int-auth`).
- Console output from the Vitest extension output panel and any container logs.
- Whether containers remained after tests (e.g., `docker ps`), and which ones.
- Any workarounds that improve teardown or reliability on your setup.

### Collecting environment info (one-liner)
Run this to generate `envinfo.txt` you can attach to issues/comments:
```bash
npx envinfo --system --binaries --browsers --npmPackages vite,vitest,typescript,prisma,@prisma/client --npmGlobalPackages > envinfo.txt
```
Please skim the files and remove anything sensitive before sharing.

### Troubleshooting
- Docker not running: ensure Docker Desktop is started or `sudo service docker start` on Linux.
- Testcontainers fails to start images:
  - Check network/proxy; images pulled: `postgres:16-alpine`, `localstack/localstack:2.3`, `evolutecx/firebase-emulator:latest`.
  - If using WSL2, enable Docker integration for your distro.
- `psql` not found: install PostgreSQL client tools and ensure `psql` is on PATH.
- Port conflicts: global setup maps ephemeral host ports; conflicts are unlikely. If you run local Postgres on 5432 it is fine.
- Firebase emulator flakiness: tests wait for TCP + HTTP readiness and retry auth calls. Re-run if you killed Docker mid-run.



