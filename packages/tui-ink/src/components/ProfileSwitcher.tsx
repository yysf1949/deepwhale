/**
 * @deepwhale/tui-ink — ProfileSwitcher 组件 (D-31.4.6, 2026-06-08).
 *
 * 接 D-31.3.6 ProfileStore, 列表 渲染 + 标 current. 不接 keybinding (留 D-32+),
 *   只 onSwitch callback (TUI 端 wire useInput).
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export interface ProfileEntry {
  name: string;
  config: { model?: string; theme?: string; [key: string]: unknown };
}

export interface ProfileSwitcherProps {
  profiles: ReadonlyArray<ProfileEntry>;
  current: string | null;
  onSwitch: (name: string) => void;
}

export const ProfileSwitcher: FC<ProfileSwitcherProps> = ({
  profiles,
  current,
  onSwitch: _onSwitch,
}) => (
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text bold color="cyan">Profiles</Text>
    {profiles.length === 0 && <Text dimColor>(no profiles)</Text>}
    {profiles.map((p) => {
      const isCurrent = p.name === current;
      const model = typeof p.config.model === 'string' ? p.config.model : '(no model)';
      return (
        <Text key={p.name}>
          <Text color={isCurrent ? 'green' : 'gray'}>
            {isCurrent ? '* ' : '  '}{p.name.padEnd(12)}
          </Text>
          <Text dimColor> {model}</Text>
        </Text>
      );
    })}
    {/* D-31.4 review B-2 fix (2026-06-08): 删 "(press number to switch)" 假文案.
        ProfileSwitcher 自身 不 接 keybinding (跟 D-31.4.6 拍 1:1). 切 profile 走
        父组件 onSwitch callback + useInput. UI 不应 promise 能力. */}
  </Box>
);
