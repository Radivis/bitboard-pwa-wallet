import { expose } from 'comlink';

console.log('[test.worker] Test worker loading...');

const api = {
  greet(name: string): string {
    console.log('[test.worker] greet called with:', name);
    return `Hello, ${name}!`;
  }
};

console.log('[test.worker] Exposing API...');
expose(api);
console.log('[test.worker] API exposed');
