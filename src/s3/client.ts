import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const useR2 = Boolean(process.env.R2_ENDPOINT);

export const s3 = new S3Client({
  region: useR2 ? 'us-east-1' : process.env.AWS_REGION,
  endpoint: useR2 ? process.env.R2_ENDPOINT : undefined,
  forcePathStyle: useR2,
  credentials: useR2
    ? {
        accessKeyId: String(process.env.R2_ACCESS_KEY_ID),
        secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY),
      }
    : undefined,
});

export const s3Bucket: string = useR2 ? String(process.env.R2_BUCKET) : String(process.env.AWS_S3_BUCKET);

export async function putTextObject(key: string, body: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      ContentType: 'text/plain; charset=utf-8',
      Body: Buffer.from(body, 'utf8'),
    }),
  );
}


