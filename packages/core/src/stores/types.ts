// Shared types for the headless `zustand/vanilla` stores (B3 §4.1 `stores/`).

/** Loading lifecycle shared by every headless store: idle -> loading -> ready | error. */
export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';
