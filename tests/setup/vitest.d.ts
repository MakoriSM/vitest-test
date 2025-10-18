// Type augmentation for Vitest provided context
import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    infra?: GlobalContext;
  }

  export interface GlobalContext {
    db?: { templateUrl: string; adminUrl: string; templateDb: string };
    s3?: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
    auth?: { emulatorHost: string; projectId: string };
  }
}


