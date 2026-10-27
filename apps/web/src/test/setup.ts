import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

// jsdom's Blob does not survive fake-indexeddb's structured clone; browsers' Blobs do, and so
// does Node's. Use Node's so stored photos behave as they do on a phone.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
