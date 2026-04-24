// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Solar } = require("lunar-javascript") as {
  Solar: {
    fromDate(d: Date): {
      getYear(): number;
      getMonth(): number;
      getDay(): number;
      getLunar(): {
        getYearInChinese(): string;
        getMonthInChinese(): string;
        getDayInChinese(): string;
        getJieQi(): string;
        getNextJieQi(): {
          getName(): string;
          getSolar(): { getYear(): number; getMonth(): number; getDay(): number };
        };
      };
    };
  };
};

export interface LunarContext {
  lunarDate: string;       // e.g. "农历丙午年三月初二"
  jieqi: string;           // today's 节气, or ""
  nextJieqi: string;       // next upcoming 节气 name
  nextJieqiDate: string;   // e.g. "5月5日"
}

export function getLunarContext(): LunarContext {
  const now = new Date();
  const solar = Solar.fromDate(now);
  const lunar = solar.getLunar();

  const lunarDate = `农历${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  const jieqi = lunar.getJieQi() || "";

  const nextJieQiObj = lunar.getNextJieQi();
  const nextSolar = nextJieQiObj.getSolar();
  const nextJieqi = nextJieQiObj.getName();
  const nextJieqiDate = `${nextSolar.getMonth()}月${nextSolar.getDay()}日`;

  return { lunarDate, jieqi, nextJieqi, nextJieqiDate };
}
