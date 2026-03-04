import { useState } from 'react';
import { useCryptoStore } from '@/stores/cryptoStore';
import { wrap } from 'comlink';

export function CryptoTest() {
  const { generateMnemonic, validateMnemonic, error } = useCryptoStore();
  const [mnemonic, setMnemonic] = useState<string>('');
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [testResult, setTestResult] = useState<string>('');

  const handleTestWorker = async () => {
    console.log('[CryptoTest] Testing simple worker...');
    const worker = new Worker(
      new URL('../workers/test.worker.ts', import.meta.url),
      { type: 'module' }
    );
    const api = wrap<{ greet: (name: string) => string }>(worker);
    console.log('[CryptoTest] Wrapped worker:', api);
    console.log('[CryptoTest] Calling api.greet...');
    try {
      const result = await api.greet('World');
      console.log('[CryptoTest] Test worker result:', result);
      setTestResult(result);
    } catch (err) {
      console.error('[CryptoTest] Test worker failed:', err);
      setTestResult(`Error: ${err}`);
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateMnemonic(12);
      setMnemonic(result);
      setIsValid(null);
    } catch (err) {
      console.error('Generate failed:', err);
    }
  };

  const handleValidate = async () => {
    if (!mnemonic) return;
    try {
      const valid = await validateMnemonic(mnemonic);
      setIsValid(valid);
    } catch (err) {
      console.error('Validate failed:', err);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-x-2">
        <button 
          onClick={handleTestWorker}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          Test Simple Worker
        </button>
        <button 
          onClick={handleGenerate}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Generate Mnemonic
        </button>
        <button 
          onClick={handleValidate}
          disabled={!mnemonic}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          Validate
        </button>
      </div>
      
      {testResult && (
        <div className="p-4 bg-purple-100 dark:bg-purple-900 rounded">
          <strong>Test Result:</strong> {testResult}
        </div>
      )}
      
      {mnemonic && (
        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded">
          <strong>Mnemonic:</strong> {mnemonic}
        </div>
      )}
      
      {isValid !== null && (
        <div className={`p-4 rounded ${isValid ? 'bg-green-800' : 'bg-red-800'}`}>
          {isValid ? '✓ Valid mnemonic' : '✗ Invalid mnemonic'}
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
