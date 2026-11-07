import zhCommon from "./resources/zh-CN/common";
import zhFormat from "./resources/zh-CN/format";
import zhPreview from "./resources/zh-CN/preview";
import enCommon from "./resources/en/common";
import enFormat from "./resources/en/format";
import enPreview from "./resources/en/preview";

export const resources = {
  "zh-CN": { common: zhCommon, format: zhFormat, preview: zhPreview },
  en: { common: enCommon, format: enFormat, preview: enPreview }
} as const;
