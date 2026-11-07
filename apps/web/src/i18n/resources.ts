import zhcommon from "./resources/zh-CN/common";
import zhformat from "./resources/zh-CN/format";
import zhpreview from "./resources/zh-CN/preview";
import zhauth from "./resources/zh-CN/auth";
import zhnavigation from "./resources/zh-CN/navigation";
import zherrors from "./resources/zh-CN/errors";
import zhinvestmentGroups from "./resources/zh-CN/investmentGroups";
import encommon from "./resources/en/common";
import enformat from "./resources/en/format";
import enpreview from "./resources/en/preview";
import enauth from "./resources/en/auth";
import ennavigation from "./resources/en/navigation";
import enerrors from "./resources/en/errors";
import eninvestmentGroups from "./resources/en/investmentGroups";

export const resources = {
  "zh-CN": { common: zhcommon, format: zhformat, preview: zhpreview, auth: zhauth, navigation: zhnavigation, errors: zherrors, investmentGroups: zhinvestmentGroups },
  "en": { common: encommon, format: enformat, preview: enpreview, auth: enauth, navigation: ennavigation, errors: enerrors, investmentGroups: eninvestmentGroups },
} as const;
