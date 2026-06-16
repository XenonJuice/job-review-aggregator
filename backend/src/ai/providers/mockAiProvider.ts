import { AiProvider } from '../provider';

// Mock Provider 不访问外部网络，用于验证本地数据流。
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';

  // 通过 prompt 中的评论编号估算输入数量，返回可预测的模拟结果。
  async analyze(prompt: string): Promise<string> {
    const reviewCount = (prompt.match(/^#\d+/gm) ?? []).length;

    return [
      `Mock AI analysis generated from ${reviewCount} review(s).`,
      '真实接入时这里会替换为 OpenAI、Claude、Gemini 或 Ollama 的返回内容。',
      '当前骨架只验证数据流，不向外部 LLM 发送数据。',
    ].join('\n');
  }
}
