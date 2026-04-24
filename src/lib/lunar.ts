// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Solar, SolarTerm } = require("lunar-javascript") as {
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
      };
    };
  };
  SolarTerm: {
    fromIndex(year: number, index: number): {
      getName(): string;
      getSolar(): { getYear(): number; getMonth(): number; getDay(): number };
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

  const year = solar.getYear();
  let nextJieqi = "";
  let nextJieqiDate = "";

  outer: for (const y of [year, year + 1]) {
    for (let i = 1; i <= 24; i++) {
      const st = SolarTerm.fromIndex(y, i);
      const s = st.getSolar();
      const stDate = new Date(s.getYear(), s.getMonth() - 1, s.getDay());
      if (stDate > now) {
        nextJieqi = st.getName();
        nextJieqiDate = `${s.getMonth()}月${s.getDay()}日`;
        break outer;
      }
    }
  }

  return { lunarDate, jieqi, nextJieqi, nextJieqiDate };
}
