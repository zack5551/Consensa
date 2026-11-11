import { describe, expect, it } from "vitest";
import { officialPublisher, statcanTable } from "@/lib/source-credit";

describe("source credit", () => {
  it("knows the official publishers by their own domains only", () => {
    expect(officialPublisher("https://www150.statcan.gc.ca/n1/en/subjects/labour/labour_force_survey")).toBe("statcan");
    expect(officialPublisher("https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/")).toBe("boc");
    expect(officialPublisher("https://statcan.gc.ca.example.com/")).toBeNull();
    expect(officialPublisher("https://climate.weather.gc.ca/")).toBeNull();
    expect(officialPublisher("not a url")).toBeNull();
  });

  it("reads a table number from a table link", () => {
    expect(statcanTable("https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701")).toBe("14-10-0287-01");
    expect(statcanTable("https://www150.statcan.gc.ca/n1/en/subjects/labour/labour_force_survey")).toBeNull();
  });
});
