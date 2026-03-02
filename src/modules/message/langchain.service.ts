import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIMessageChunk } from "@langchain/core/messages";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { z } from "zod";

// --- Zod Schemas ---

export const IntakeFormSchema = z.object({
  card_type: z.literal("intake_form"),
  title: z.string().min(1),
  options: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .min(2)
    .max(6),
  allow_multi: z.boolean(),
  free_text: z.object({
    enabled: z.boolean(),
    placeholder: z.string().optional(),
    max_len: z.number().int().positive().max(500).optional(),
  }),
  submit: z.object({
    action: z.literal("send_message"),
    button_text: z.string().min(1),
  }),
});

export const PolicySchema = z
  .object({
    need_intake_form: z.boolean(),
    intake_form: IntakeFormSchema.optional(),
    should_promote_download: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.need_intake_form && !v.intake_form) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "need_intake_form=true requires intake_form",
      });
    }
  });

export const DownloadAppSchema = z
  .object({
    card_type: z.literal("download_app"),
    title: z.string().min(4).max(30),
    sub_title: z.string().min(6).max(60).optional(),
    content: z.string().min(20).max(120).optional(),
    img_url: z.string().url().optional(),
  })
  .superRefine((v, ctx) => {
    const hasSub = !!v.sub_title;
    const hasContent = !!v.content;
    if (hasSub && hasContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sub_title and content are mutually exclusive",
      });
    }
    if (!hasSub && !hasContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "either sub_title or content must exist",
      });
    }
  });

@Injectable()
export class LangChainService {
  private chatModel: ChatOpenAI;
  private policyModel: ChatOpenAI; // Use a potentially cheaper/faster model for policy if desired
  private policyParser = StructuredOutputParser.fromZodSchema(PolicySchema);
  private downloadParser =
    StructuredOutputParser.fromZodSchema(DownloadAppSchema);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    const baseURL = this.configService.get<string>("OPENAI_BASE_URL");
    const modelName =
      this.configService.get<string>("OPENAI_MODEL") || "gpt-3.5-turbo";

    this.chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      configuration: { baseURL },
      modelName,
      temperature: 0.7,
      streaming: true,
    });

    // Policy model can be the same or different (e.g., gpt-4o-mini as suggested, but using same config for simplicity here)
    this.policyModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      configuration: { baseURL },
      modelName, // Or hardcode 'gpt-4o-mini' if available
      temperature: 0, // Deterministic for policy
    });
  }

  // --- Policy Chain ---
  async runPolicySafe(input: {
    user_text: string;
    recent_messages: Array<{ role: string; content: string }>;
  }) {
    const POLICY_SYSTEM = `
你是医疗问答助手的“对话策略决策器”。只输出JSON，不输出任何解释文字。
任务：决定是否需要追问卡片(intake_form)；是否插入下载卡(download_app)。

【核心规则 - 必须严格执行】：
1. **强制追问机制**：如果用户的描述是简单的症状（如“我头痛”、“肚子疼”、“发烧了”、“失眠”等），且上下文中没有提供详细的病史信息（如持续时间、具体部位、诱发因素、伴随症状等），**必须**设置 \`need_intake_form=true\`。
2. **宁可多问，不可盲目建议**：作为一个严谨的 AI 医生，在信息不全时直接给出建议是不负责任的。只有当用户已经提供了非常详尽的信息，或者这是一个通用的健康咨询（非诊疗类），才允许 \`need_intake_form=false\`。
3. **Intake Form 设计**：
   - 针对缺失的最关键信息设计问题（通常是“持续时间”或“具体症状表现”）。
   - options 必须包含 2~6 个选项，key 使用英文短码（1d/3d/1w/acute/dull 等）。
   - label 必须简短易懂。

4. **Download App 规则**：
   - 如果是一个医疗问诊类问题（无论是否追问），或者用户表达了较高的焦虑，建议设置 \`should_promote_download=true\`，引导去 App 获得更专业的医生服务。

【示例】：
- 用户：“我头痛” -> need_intake_form=true (问时长或部位)
- 用户：“我肚子疼” -> need_intake_form=true (问位置或时长)
- 用户：“感冒了吃什么药？” -> need_intake_form=true (问症状细节，除非用户只想要通用科普) -> 如果不确定，优先追问。

输出必须严格符合格式指令。
`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", POLICY_SYSTEM],
      ["user", "用户问题：{user_text}\n\n最近对话：\n{recent}"],
      ["system", "{format_instructions}"],
    ]);

    const chain = RunnableSequence.from([
      async (inp: {
        user_text: string;
        recent_messages: Array<{ role: string; content: string }>;
      }) => {
        const recent =
          inp.recent_messages
            .filter((m) => !!m.content)
            .slice(-12)
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n") || "(无)";
        return {
          user_text: inp.user_text,
          recent,
          format_instructions: this.policyParser.getFormatInstructions(),
        };
      },
      prompt,
      this.policyModel,
      this.policyParser,
    ]);

    try {
      return await chain.invoke(input);
    } catch (e) {
      console.error("Policy chain failed:", e);
      // Fallback: 如果解析失败，为了安全起见，对于短文本可以默认追问，但这里先保持 false
      return { need_intake_form: false, should_promote_download: false };
    }
  }

  // --- Download Copy Chain ---
  async runDownloadCopySafe(input: {
    user_text: string;
    answer_md: string;
    need_image: boolean;
  }) {
    const DOWNLOAD_SYSTEM = `
你是医疗健康App的增长文案生成器。只输出JSON，不输出任何解释文字。
任务：结合“用户问题 + 本轮回答内容”生成 download_app 卡片文案，引导用户下载App获得更完整服务。

硬规则：
- 输出必须严格符合格式指令（JSON）
- title：4~30字，结合本次问题强调更完整服务/持续管理/随访等利益点，不夸大疗效
- sub_title 与 content 互斥（二选一必须存在）：
  - sub_title：6~60字，短促说明利益点
  - content：20~120字，更详细说明（与本次医疗内容相关），但不能承诺治愈/替代就医
- img_url：只有 need_image=true 时才输出，否则不要输出 img_url
- cta 不要输出（后端固定）
`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", DOWNLOAD_SYSTEM],
      [
        "user",
        "用户问题：{user_text}\n\n本轮回答（Markdown）：\n{answer_md}\n\nneed_image: {need_image}",
      ],
      ["system", "{format_instructions}"],
    ]);

    const chain = RunnableSequence.from([
      async (inp: {
        user_text: string;
        answer_md: string;
        need_image: boolean;
      }) => ({
        user_text: inp.user_text,
        answer_md: inp.answer_md.slice(0, 2000), // Truncate to avoid token limit
        need_image: inp.need_image ? "true" : "false",
        format_instructions: this.downloadParser.getFormatInstructions(),
      }),
      prompt,
      this.policyModel, // Reuse policy model (low temp)
      this.downloadParser,
    ]);

    try {
      return await chain.invoke(input);
    } catch (e) {
      console.error("Download copy chain failed:", e);
      return null;
    }
  }

  // --- Main Stream Response ---
  async streamResponse(input: string, signal: AbortSignal) {
    if (!input || !input.trim()) {
      throw new Error("Input cannot be empty");
    }
    console.log(
      `[LangChainService] Streaming response for input: "${input.slice(0, 50)}..."`,
    );

    const systemPrompt = `你是一个专业的医疗健康咨询助手。
      请严格遵守以下输出规则：
      1) 只输出 Markdown 纯文本，不要输出 JSON 或代码块。
      2) 使用清晰结构：标题（###）、列表（-）、段落。
      2) 输出内容，请你从医生的角度出发，先对用户的病症进行概括和第一次回答，再根据需要追问。
      4) 医疗合规：
        - 不写处方剂量（如“服用阿莫西林0.5g”）。
        - 出现危险症状（如胸痛、呼吸困难、意识异常、大量出血等）必须强烈建议立即就医/急诊。
        - 回答仅供参考，不构成医疗建议。

      5) 追问输出规则（非常重要）：
      - 你会得到一个布尔值 need_intake_form，以及一个字符串 intake_question（可能为空）。
      - 当 need_intake_form=true 时：你的回答最后必须**单独一行**输出 与 intake_question 相关的一句话。`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["user", "{input}"],
    ]);

    const chain = prompt.pipe(this.chatModel);

    const stream = await chain.stream({ input }, { signal });

    return stream;
  }

  extractChunkText(chunk: AIMessageChunk): string {
    if (typeof chunk.content === "string") {
      return chunk.content;
    }
    if (Array.isArray(chunk.content)) {
      return chunk.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("");
    }
    return "";
  }
}
