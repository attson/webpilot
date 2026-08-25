// packages/shared/src/presets/index.ts
import type { Preset } from "../preset";
import { wikipediaSummary } from "./content/wikipedia";
import { githubRepoBrief } from "./content/github-repo";
import { githubIssueDigest } from "./content/github-issue";
import { mediumArticleTldr } from "./content/medium";
import { zhihuQuestionSummary } from "./content/zhihu";
import { wechatMpSummary } from "./content/wechat-mp";
import { articleTranslateZh } from "./content/article-translate";
import { taobaoItemCollect } from "./ecommerce/taobao";
import { jdItemCollect } from "./ecommerce/jd";
import { alibaba1688DetailCollect } from "./ecommerce/_1688";
import { amazonProductCollect } from "./ecommerce/amazon";

export const PRESETS: readonly Preset[] = Object.freeze([
  // content
  wikipediaSummary,
  githubRepoBrief,
  githubIssueDigest,
  mediumArticleTldr,
  zhihuQuestionSummary,
  wechatMpSummary,
  articleTranslateZh,
  // ecommerce
  taobaoItemCollect,
  jdItemCollect,
  alibaba1688DetailCollect,
  amazonProductCollect
]);
