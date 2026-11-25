import crypto from 'node:crypto';

export interface S3UploadResult {
  key: string;
  url: string;
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function encodeS3Path(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT?.trim() &&
      process.env.S3_BUCKET?.trim() &&
      process.env.S3_ACCESS_KEY_ID?.trim() &&
      process.env.S3_SECRET_ACCESS_KEY?.trim(),
  );
}

/**
 * Uploads a buffer to S3-compatible object storage using AWS Signature V4.
 * Zero external SDK dependencies.
 */
export async function uploadPaymentProofToS3(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<S3UploadResult> {
  const endpoint = (process.env.S3_ENDPOINT || '').trim().replace(/\/+$/, '');
  const bucket = (process.env.S3_BUCKET || '').trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.S3_SECRET_ACCESS_KEY || '').trim();
  const region = (process.env.S3_REGION || 'auto').trim();
  const pathStyle = (process.env.S3_PATH_STYLE || 'true').trim().toLowerCase() !== 'false';
  const rawPrefix = (process.env.S3_PREFIX || 'aversa-media').trim().replace(/^\/+|\/+$/g, '');
  const basePrefix = rawPrefix.replace(/\/payments$/i, '');
  const objectKey = basePrefix ? `${basePrefix}/payments/${filename}` : `payments/${filename}`;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Konfigurasi penyimpanan S3 belum lengkap.');
  }

  const endpointUrl = new URL(endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(buffer);

  const encodedKey = encodeS3Path(objectKey);
  const host = pathStyle ? endpointUrl.host : `${bucket}.${endpointUrl.host}`;
  const canonicalUri = pathStyle ? `/${encodeURIComponent(bucket)}/${encodedKey}` : `/${encodedKey}`;
  const requestUrl = `${endpointUrl.protocol}//${host}${canonicalUri}`;

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-acl:public-read\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(requestUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-acl': 'public-read',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload S3 gagal (HTTP ${res.status}): ${errText.slice(0, 120)}`);
  }

  const publicBase = (process.env.S3_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  let publicUrl: string;
  if (publicBase) {
    const pubHost = new URL(publicBase).host;
    publicUrl = pubHost === bucket || !pathStyle
      ? `${publicBase}/${encodedKey}`
      : `${publicBase}/${encodeURIComponent(bucket)}/${encodedKey}`;
  } else {
    publicUrl = requestUrl;
  }

  return { key: objectKey, url: publicUrl };
}
