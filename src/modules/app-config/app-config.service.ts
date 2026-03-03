import { Injectable } from "@nestjs/common";

@Injectable()
export class AppConfigService {
  getConfig() {
    return {
      disclaimer: {
        top_bar: "AI回答仅供参考，请勿用于医疗诊断或就医决策",
        bottom_hint: "回答不构成诊断依据，如有不适请尽快就医",
      },
      tools: [
        { key: "report", title: "报告解读", icon: "report" },
        { key: "download", title: "立即下载", icon: "download1" },
        { key: "photo", title: "拍患处", icon: "camera" },
        { key: "ingredient", title: "拍成分", icon: "ingredients" },
        { key: "doctor", title: "就医推荐", icon: "pre_comment" },
        { key: "medicine", title: "拍药品", icon: "medicine" },
        { key: "history", title: "咨询记录", icon: "cc-history" },
      ],
      limits: {
        text_max_len: 500,
        send_rate_limit_ms: 3000,
        image_max_mb: 10,
        upload_timeout_s: 30,
        image_max_count: 9,
      },
    };
  }
}
