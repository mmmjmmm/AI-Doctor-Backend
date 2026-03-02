import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { AIMessageChunk } from '@langchain/core/messages';

@Injectable()
export class LangChainService {
  private chatModel: ChatOpenAI;

  constructor(private configService: ConfigService) {
    this.chatModel = new ChatOpenAI({
      openAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
      // Allow overriding base URL if needed (e.g. for proxies)
      configuration: {
        baseURL: this.configService.get<string>('OPENAI_BASE_URL'),
      },
      // Use model from env, default to deepseek-ai/DeepSeek-V3 as example for SiliconFlow if not set,
      // or standard gpt-3.5-turbo if using OpenAI directly.
      modelName:
        this.configService.get<string>('OPENAI_MODEL') || 'gpt-3.5-turbo',
      temperature: 0.7,
      streaming: true,
    });
  }

  async streamResponse(input: string, signal: AbortSignal) {
    const systemPrompt = `你是一个专业的医疗健康咨询助手。
请严格遵守以下输出规则：
1. 只输出 Markdown 纯文本，不要输出 JSON 或代码块。
2. 使用清晰的结构：包含标题（###）、列表（-）、段落。
3. 医疗合规：
   - 不下诊断结论（如“你得了感冒”）。
   - 不写处方剂量（如“服用阿莫西林 0.5g”）。
   - 出现危险症状（如胸痛、呼吸困难）必须强烈建议就医。
   - 回答仅供参考，不构成医疗建议。`;

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['user', '{input}'],
    ]);

    const chain = prompt.pipe(this.chatModel);

    // Use .stream() which returns an AsyncIterable
    // Pass signal to the call for cancellation
    const stream = await chain.stream(
      { input },
      { signal },
    );

    return stream;
  }

  // Helper to extract text from chunk safely
  extractChunkText(chunk: AIMessageChunk): string {
    if (typeof chunk.content === 'string') {
      return chunk.content;
    }
    // Handle array content (multimodal) if ever encountered, though we requested text
    if (Array.isArray(chunk.content)) {
      return chunk.content
        .map((c) => (c.type === 'text' ? c.text : ''))
        .join('');
    }
    return '';
  }
}
