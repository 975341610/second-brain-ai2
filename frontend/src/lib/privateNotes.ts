const PRIVATE_NOTE_PREFIX = 'sb-private:v1:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type PrivateNoteSnapshot = {
  title: string;
  content: string;
  icon: string;
  is_title_manually_edited: boolean;
};

type PrivateEnvelope = {
  v: 1;
  alg: 'AES-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
};

let sessionPrivateSecret: string | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function derivePrivateKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 250000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toSnapshot(value: unknown): PrivateNoteSnapshot {
  const parsed = value as Partial<PrivateNoteSnapshot>;
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '未命名笔记',
    content: typeof parsed.content === 'string' ? parsed.content : '<p></p>',
    icon: typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : '📝',
    is_title_manually_edited: !!parsed.is_title_manually_edited,
  };
}

export function isEncryptedPrivateContent(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.startsWith(PRIVATE_NOTE_PREFIX);
}

export function getSessionPrivateSecret(): string | null {
  return sessionPrivateSecret;
}

export function setSessionPrivateSecret(secret: string | null): void {
  sessionPrivateSecret = secret && secret.trim() ? secret.trim() : null;
}

export async function encryptPrivateNoteSnapshot(snapshot: PrivateNoteSnapshot, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePrivateKey(secret, salt);
  const plaintext = encoder.encode(JSON.stringify(toSnapshot(snapshot)));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));

  const envelope: PrivateEnvelope = {
    v: 1,
    alg: 'AES-GCM',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };

  return `${PRIVATE_NOTE_PREFIX}${bytesToBase64(encoder.encode(JSON.stringify(envelope)))}`;
}

export async function decryptPrivateNoteSnapshot(content: string, secret: string): Promise<PrivateNoteSnapshot> {
  if (!isEncryptedPrivateContent(content)) {
    throw new Error('当前内容不是受支持的私密加密格式。');
  }

  try {
    const envelopeJson = decoder.decode(base64ToBytes(content.slice(PRIVATE_NOTE_PREFIX.length)));
    const envelope = JSON.parse(envelopeJson) as PrivateEnvelope;
    const key = await derivePrivateKey(secret, base64ToBytes(envelope.salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.ciphertext),
    );
    return toSnapshot(JSON.parse(decoder.decode(new Uint8Array(plaintext))));
  } catch {
    throw new Error('解锁密码不正确，或私密笔记内容已损坏。');
  }
}
