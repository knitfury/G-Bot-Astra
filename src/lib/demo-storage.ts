// The desktop Demo receives only this isolated two-key store, never live IPC.
export const demoStorage = {
  getItem(name: string): string | null {
    if (!window.gbotDemo) return localStorage.getItem(name);
    const saved = window.gbotDemo.getItem(name);
    if (saved !== null) return saved;
    // Import any accessible pre-upgrade browser value without resetting it.
    const legacy = localStorage.getItem(name);
    if (legacy !== null)
      void window.gbotDemo.setItem(name, legacy).catch(() => {});
    return legacy;
  },
  setItem(name: string, value: string) {
    if (window.gbotDemo) return window.gbotDemo.setItem(name, value);
    localStorage.setItem(name, value);
  },
  removeItem(name: string) {
    if (window.gbotDemo) return window.gbotDemo.setItem(name, null);
    localStorage.removeItem(name);
  },
};
