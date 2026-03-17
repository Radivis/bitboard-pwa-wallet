/**
 * Message types for the worker-to-worker secrets channel (encryption worker ↔ crypto worker).
 * Main thread never reads this channel; it only passes the ports to the workers.
 */

export interface EncryptedBlobMessage {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
}

export type SecretsChannelDecryptRequest = {
  type: 'DECRYPT';
  requestId: string;
  password: string;
  encryptedBlob: EncryptedBlobMessage;
};

export type SecretsChannelDecryptResult = {
  type: 'DECRYPT_RESULT';
  requestId: string;
  plaintext: string;
};

export type SecretsChannelDecryptError = {
  type: 'DECRYPT_ERROR';
  requestId: string;
  error: string;
};

export type SecretsChannelEncryptRequest = {
  type: 'ENCRYPT';
  requestId: string;
  password: string;
  plaintext: string;
};

export type SecretsChannelEncryptResult = {
  type: 'ENCRYPT_RESULT';
  requestId: string;
  encryptedBlob: EncryptedBlobMessage;
};

export type SecretsChannelEncryptError = {
  type: 'ENCRYPT_ERROR';
  requestId: string;
  error: string;
};

export type SecretsChannelRequest =
  | SecretsChannelDecryptRequest
  | SecretsChannelEncryptRequest;

export type SecretsChannelResponse =
  | SecretsChannelDecryptResult
  | SecretsChannelDecryptError
  | SecretsChannelEncryptResult
  | SecretsChannelEncryptError;
