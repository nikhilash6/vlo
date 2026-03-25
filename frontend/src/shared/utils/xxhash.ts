import xxhash from "xxhash-wasm";

let hasherPromise: Promise<Awaited<ReturnType<typeof xxhash>>> | null = null;

async function getHasher(): Promise<Awaited<ReturnType<typeof xxhash>>> {
  if (!hasherPromise) {
    hasherPromise = xxhash();
  }

  return hasherPromise;
}

export async function createXxhash64() {
  const hasher = await getHasher();
  return hasher.create64();
}

export async function computeXxhash64Bytes(bytes: Uint8Array): Promise<string> {
  const h64 = await createXxhash64();
  h64.update(bytes);
  return h64.digest().toString(16);
}

export async function computeXxhash64String(value: string): Promise<string> {
  return computeXxhash64Bytes(new TextEncoder().encode(value));
}
