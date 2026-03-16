export interface EncryptionService {
  deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array>;
}
