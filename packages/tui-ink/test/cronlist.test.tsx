import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { CronList } from '../src/components/CronList.js';

describe('CronList', () => {
  it('renders cron jobs', () => {
    const jobs = [
      { id: 'j1', schedule: '0 9 * * *', prompt: 'morning brief', enabled: true },
      { id: 'j2', schedule: 'every 2h', prompt: 'watcher', enabled: false },
    ];
    const { lastFrame } = render(<CronList jobs={jobs} onToggle={() => {}} />);
    expect(lastFrame()).toContain('0 9 * * *');
    expect(lastFrame()).toContain('morning brief');
    expect(lastFrame()).toContain('●');
    expect(lastFrame()).toContain('○');
  });
});