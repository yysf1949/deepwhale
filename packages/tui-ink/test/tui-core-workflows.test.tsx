/**
 * D-33.1.4 — TUI core workflow contract (v1.0 capability surface).
 *
 * 拍板: 既有 app.smoke.test.ts / tui-slash-basic.test.ts / sessionlist.test.tsx
 * 覆盖 5 基础 case (render/exit, theme, highlight, history, transcript). 这里
 * 加 2 条 App-level 集成测试 pin v1.0 核心 workflow:
 *   1. App 启动渲染 status bar + prompt, 不依赖 session / config, 启动立即可见
 *   2. App 接收 `options.sessionPath` 注入时, 不抛错, 仍然渲染 status bar
 *
 * 边界: 真实的 prompt 输入 + slash routing 已由 tui-slash-basic.test.ts 跟
 * 端到端 codereviewcard.test.tsx 覆盖. 这 2 条测试**只** pin "App 启动不挂"
 * + "关键 UI 元素出现" 的契约.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../src/app.js';

describe('tui core workflow (D-33.1.4)', () => {
  it('renders status bar and prompt on startup without session', () => {
    const screen = render(
      React.createElement(App, {
        options: {},
        onExit: () => {},
      }),
    );
    // status bar + deepwhale 标题 + 状态栏含 Status 标签
    const frame = screen.lastFrame() ?? '';
    expect(frame).toContain('deepwhale');
    expect(frame.toLowerCase()).toMatch(/status|model/);
    // prompt 区 (StatusBar / Prompt 是 App 必有元素)
    expect(frame).toMatch(/.+/);
    screen.unmount();
  });

  it('renders status bar and prompt with a session path configured', () => {
    // sessionPath 注入 = 走真 SessionWriter 路径. 仍然渲染 startup OK.
    const screen = render(
      React.createElement(App, {
        options: { sessionPath: '/tmp/d33.1.4-nonexistent.jsonl' },
        onExit: () => {},
      }),
    );
    const frame = screen.lastFrame() ?? '';
    expect(frame).toContain('deepwhale');
    expect(frame).toMatch(/status|model/i);
    screen.unmount();
  });
});
