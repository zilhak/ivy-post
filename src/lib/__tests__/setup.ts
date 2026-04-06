import { GlobalWindow } from 'happy-dom';

const window = new GlobalWindow({ url: 'http://localhost:3000' });

// DOM 글로벌 등록
for (const key of ['document', 'HTMLElement', 'Element', 'Node', 'Text', 'DocumentFragment', 'DOMParser', 'MutationObserver', 'CustomEvent', 'Event']) {
  (globalThis as any)[key] = (window as any)[key];
}
globalThis.window = window as any;
globalThis.document = window.document as any;
