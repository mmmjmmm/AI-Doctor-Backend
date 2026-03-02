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
    // 追问卡
    need_intake_form: z.boolean(),
    next_question: z.string().optional(), // need_intake_form=true 时必须有
    intake_form: IntakeFormSchema.optional(), // need_intake_form=true 时必须有

    // 下载卡开关
    should_promote_download: z.boolean(),

    // 是否结束问诊（用于 consult_summary 触发）
    closing_intent: z.enum(["continue", "end_by_user", "end_by_model"]),
    closing_reason: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.need_intake_form) {
      if (!v.intake_form) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "need_intake_form=true requires intake_form",
        });
      }
      if (!v.next_question || v.next_question.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "need_intake_form=true requires next_question",
        });
      }
      if (v.closing_intent !== "continue") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "need_intake_form=true must have closing_intent=continue",
        });
      }
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

export const ConsultSummarySchema = z.object({
  card_type: z.literal("consult_summary"),
  title: z.string().min(1).max(20),
  summary: z.string().min(1).max(300),
  patient_info: z.object({
    title: z.string().min(2).max(20),
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(20),
          value: z.string().min(1).max(100),
        }),
      )
      .min(0)
      .max(8),
  }),
  advice_list: z
    .array(
      z.object({
        title: z.string().min(1).max(30),
        content: z.string().min(1).max(200),
      }),
    )
    .min(0)
    .max(5),
  footer: z.object({
    disclaimer: z.string().min(6).max(60),
  }),
});

@Injectable()
export class LangChainService {
  private chatModel: ChatOpenAI;
  private policyModel: ChatOpenAI; // Use a potentially cheaper/faster model for policy if desired
  private policyParser = StructuredOutputParser.fromZodSchema(PolicySchema);
  private downloadParser =
    StructuredOutputParser.fromZodSchema(DownloadAppSchema);
  private summaryParser =
    StructuredOutputParser.fromZodSchema(ConsultSummarySchema);

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
任务：决定是否需要追问卡片(intake_form)；是否插入下载卡(download_app), 是否结束问诊（用于 consult_summary 触发）。

你的输出必须包含：
- need_intake_form: boolean
- next_question: string（当 need_intake_form=true 必填）
- intake_form: object（当 need_intake_form=true 必填）
- should_promote_download: boolean
- closing_intent: "continue" | "end_by_user" | "end_by_model"
- closing_reason: string（可选）

【核心规则 - 必须严格执行】：
规则A：追问（intake_form）
- 如果用户信息不足以给出建议（缺少：持续时间/严重程度/伴随症状/诱因/既往史等关键项），need_intake_form=true：
  - next_question：一句自然的追问（例如“你的症状持续多久了？”）
  - intake_form：options 2~6 个；label 简短；key 用英文短码（如 1d/3d/1w）；可补充 free_text
- 如果信息足够明确能给出建议，need_intake_form=false（不要生成 intake_form）

规则B：下载卡开关 should_promote_download
- 复杂问题、多轮、或者回答将给出较完整建议 → true
- 其他情况 → false

规则C：结束问诊 closing_intent（用于生成 consult_summary）
- 如果用户表达结束意愿（例如：谢谢/明白了/可以了/不用了/结束/就这样/不问了/OK了/我去医院了/我先这样），closing_intent="end_by_user"
- 否则如果你认为本轮已经足够给出建议且无需继续追问，closing_intent="end_by_model"
- 其他情况 closing_intent="continue"
- 重要：当 need_intake_form=true 时，closing_intent 必须为 "continue"（不能一边追问一边结束）

输出必须严格符合格式指令（JSON）。

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
      return {
        need_intake_form: false,
        should_promote_download: false,
        closing_intent: "continue" as const,
        next_question: undefined,
        intake_form: undefined,
        closing_reason: undefined,
      };
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

  // --- Summary Chain ---
  async runSummarySafe(input: {
    user_text: string;
    answer_text: string;
    disclaimer: string;
  }) {
    const SUMMARY_SYSTEM = `
你是医疗问答助手的“咨询总结卡片生成器”。只输出JSON，不输出任何解释文字。
任务：根据用户问题与本轮回答内容，生成 consult_summary 总结卡。

规则：
- title 固定为“本次咨询总结”
- summary：2~5句，概括问题要点与建议（不要下诊断结论，不要给处方剂量）
- patient_info.items：只提取用户明确提到的信息（症状、持续时间、伴随症状、诱因等），不确定就不写或写“未提及”，允许为空数组
- advice_list：列出 1~5 条建议（生活方式/就医指引/风险提示等），允许为空数组
- footer.disclaimer 必须使用传入的免责声明文本（不要自己改写）
输出必须符合格式指令。
`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SUMMARY_SYSTEM],
      [
        "user",
        "用户问题：{user_text}\n\n本轮回答（Markdown）：\n{answer_text}\n\n免责声明：{disclaimer}",
      ],
      ["system", "{format_instructions}"],
    ]);

    const chain = RunnableSequence.from([
      async (inp: {
        user_text: string;
        answer_text: string;
        disclaimer: string;
      }) => ({
        user_text: inp.user_text,
        answer_text: inp.answer_text.slice(0, 2500), // 防止太长
        disclaimer: inp.disclaimer,
        format_instructions: this.summaryParser.getFormatInstructions(),
      }),
      prompt,
      this.policyModel, // Reuse policy model
      this.summaryParser,
    ]);

    try {
      const result = await chain.invoke(input);
      console.log(
        "[LangChainService] Summary generated:",
        JSON.stringify(result),
      );
      return result;
    } catch (e) {
      console.error("Summary chain failed:", e);
      return null;
    }
  }

  // --- Main Stream Response ---
  async streamResponse(input: {
    user_text: string;
    recent_messages: Array<{ role: string; content: string }>;
    need_intake_form: boolean;
    intake_question?: string;
  }, signal: AbortSignal) {
    if (!input.user_text || !input.user_text.trim()) {
      throw new Error("Input cannot be empty");
    }
    console.log(
      `[LangChainService] Streaming response for input: "${input.user_text.slice(0, 50)}..."`,
    );

    const systemPrompt = `你是一个专业的医疗健康咨询助手。
      请严格遵守以下输出规则：
      1) 只输出 Markdown 纯文本，不要输出 JSON 或代码块。
      2) 使用清晰结构：标题（###）、列表（-）、段落。
      3) 你会同时拿到“当前用户输入”和“最近对话”。
        - 如果当前输入是对上一轮问题的补充回答、时间描述、程度描述、是否症状、单个短语（如“白天”“晚上”“3天”“没有胸痛”），必须结合最近对话继续问诊，不能把它当成全新的独立问题。
        - 只有当用户明确提出了新的症状或新的咨询主题时，才允许切换到新问题。
      4) 输出内容，请你从医生的角度出发，先结合上下文概括当前病情进展，再给出针对性分析或下一步建议。
      4) 医疗合规：
        - 不写处方剂量（如“服用阿莫西林0.5g”）。
        - 出现危险症状（如胸痛、呼吸困难、意识异常、大量出血等）必须强烈建议立即就医/急诊。
        - 回答仅供参考，不构成医疗建议。

      5) 追问输出规则（非常重要）：
      - 你会得到一个布尔值 need_intake_form，以及一个字符串 intake_question（可能为空）。
      - 当 need_intake_form=true 且 intake_question 非空时：你的回答最后必须**单独一行**输出 与 intake_question 相关的一句话。`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      [
        "user",
        "当前用户输入：{user_text}\n\n最近对话：\n{recent}\n\nneed_intake_form: {need_intake_form}\nintake_question: {intake_question}",
      ],
    ]);

    const chain = prompt.pipe(this.chatModel);

    const recent =
      input.recent_messages
        .filter((m) => !!m.content)
        .slice(-12)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n") || "(无)";

    const stream = await chain.stream(
      {
        user_text: input.user_text,
        recent,
        need_intake_form: input.need_intake_form ? "true" : "false",
        intake_question: input.intake_question || "",
      },
      { signal },
    );

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
