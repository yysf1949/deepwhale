import { vi } from 'vitest';
import type { LLMClient, ChatResult, ModelId } from '@deepwhale/llm';

export function createMockLLMClient(
  response: ChatResult,
): LLMClient {
  return {
    model: 'mock-model' as ModelId,
    chat: vi.fn().mockResolvedValue(response),
    stream: vi.fn().mockResolvedValue(response),
  } as LLMClient;
}
