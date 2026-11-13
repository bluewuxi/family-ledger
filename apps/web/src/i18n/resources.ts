import zhmaintenance from "./resources/zh-CN/maintenance";
import enmaintenance from "./resources/en/maintenance";
import zhabout from "./resources/zh-CN/about";
import enabout from "./resources/en/about";
import zhspendingImport from "./resources/zh-CN/spendingImport";
import enspendingImport from "./resources/en/spendingImport";
import zhsettings from "./resources/zh-CN/settings";
import ensettings from "./resources/en/settings";
import zhcashflow from "./resources/zh-CN/cashflow";
import encashflow from "./resources/en/cashflow";
import zhspending from "./resources/zh-CN/spending";
import enspending from "./resources/en/spending";
import zheducationReserve from "./resources/zh-CN/educationReserve";
import eneducationReserve from "./resources/en/educationReserve";
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
  "zh-CN": { common: zhcommon, format: zhformat, preview: zhpreview, auth: zhauth, navigation: zhnavigation, errors: zherrors, investmentGroups: zhinvestmentGroups, investment: zhinvestment, dashboard: zhdashboard, holdings: zhholdings, monthlyReview: zhmonthlyReview, accounts: zhaccounts, instruments: zhinstruments, transactions: zhtransactions, settings: zhsettings, cashflow: zhcashflow, spending: zhspending, educationReserve: zheducationReserve, spendingImport: zhspendingImport, maintenance: zhmaintenance, about: zhabout },
  "en": { common: encommon, format: enformat, preview: enpreview, auth: enauth, navigation: ennavigation, errors: enerrors, investmentGroups: eninvestmentGroups, investment: eninvestment, dashboard: endashboard, holdings: enholdings, monthlyReview: enmonthlyReview, accounts: enaccounts, instruments: eninstruments, transactions: entransactions, settings: ensettings, cashflow: encashflow, spending: enspending, educationReserve: eneducationReserve, spendingImport: enspendingImport, maintenance: enmaintenance, about: enabout },
} as const;
