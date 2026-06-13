export type BrowserCapability = 'browser.navigate' | 'browser.click' | 'browser.type';

export interface BrowserRuntime {
  capabilities: ReadonlyArray<BrowserCapability>;
  profile: 'browser';
}

export function createBrowserRuntime(): BrowserRuntime {
  return {
    capabilities: ['browser.navigate', 'browser.click', 'browser.type'],
    profile: 'browser',
  };
}
