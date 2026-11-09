import zhinvestment from "./resources/zh-CN/investment";
import eninvestment from "./resources/en/investment";
import zhdashboard from "./resources/zh-CN/dashboard";
import endashboard from "./resources/en/dashboard";
import zhholdings from "./resources/zh-CN/holdings";
import enholdings from "./resources/en/holdings";
import zhmonthlyReview from "./resources/zh-CN/monthlyReview";
import enmonthlyReview from "./resources/en/monthlyReview";
import zhaccounts from "./resources/zh-CN/accounts";
import enaccounts from "./resources/en/accounts";
import zhinstruments from "./resources/zh-CN/instruments";
import eninstruments from "./resources/en/instruments";
import zhtransactions from "./resources/zh-CN/transactions";
import entransactions from "./resources/en/transactions";
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
  "zh-CN": { common: zhcommon, format: zhformat, preview: zhpreview, auth: zhauth, navigation: zhnavigation, errors: zherrors, investmentGroups: zhinvestmentGroups, investment: zhinvestment, dashboard: zhdashboard, holdings: zhholdings, monthlyReview: zhmonthlyReview, accounts: zhaccounts, instruments: zhinstruments, transactions: zhtransactions },
  "en": { common: encommon, format: enformat, preview: enpreview, auth: enauth, navigation: ennavigation, errors: enerrors, investmentGroups: eninvestmentGroups, investment: eninvestment, dashboard: endashboard, holdings: enholdings, monthlyReview: enmonthlyReview, accounts: enaccounts, instruments: eninstruments, transactions: entransactions },
} as const;
