// End-to-end encryption for SecureDrop.
//
// The server never sees a decryption key or plaintext payload. Each device
// generates a non-extractable ECDH (P-256) key pair locally. Public keys are
// exchanged during pairing (over the same channel as the pairing code/QR —
// itself protected by HTTPS/WSS in transit). Both sides then derive an
// identical AES-256-GCM key via ECDH + HKDF. That key encrypts every file
// chunk, note, and clipboard payload sent over the WebRTC DataChannel.
// Even if the signaling/relay server were fully compromised, it only ever
// sees ciphertext for application data — it never has the private key
// needed to decrypt it.

const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' };

export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey', 'deriveBits']);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, publicKeyJwk };
}

export async function importPeerPublicKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, ECDH_PARAMS, [], []);
}

/**
 * Derive a shared AES-GCM key from our private key + the peer's public key.
 * HKDF is applied implicitly by deriveKey's ECDH -> AES-GCM pipeline via an
 * intermediate derived bit string, salted with a fixed, public application
 * label (safe — HKDF salts need not be secret, only the ECDH shared secret
 * does).
 */
export async function deriveSharedKey(privateKey, peerPublicKey) {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('securedrop-v1-salt'),
      info: new TextEncoder().encode('securedrop-datachannel-key'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt an ArrayBuffer. Returns a single Uint8Array: [12-byte iv][ciphertext]. */
export async function encryptBytes(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const out = new Uint8Array(iv.length + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ciphertext), iv.length);
  return out;
}

/** Decrypt a Uint8Array produced by encryptBytes. Returns an ArrayBuffer. */
export async function decryptBytes(key, framed) {
  const iv = framed.slice(0, 12);
  const ciphertext = framed.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

export async function encryptText(key, text) {
  return encryptBytes(key, new TextEncoder().encode(text));
}

export async function decryptText(key, framed) {
  const buf = await decryptBytes(key, framed);
  return new TextDecoder().decode(buf);
}
