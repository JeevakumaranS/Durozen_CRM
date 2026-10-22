import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLineCategoryData,
  buildTrendData,
  supportsTrend,
  trendDomain,
} from "./report-chart-data";

test("line chart keeps separate Won/Lost records even when they share an outcome", () => {
  const points = buildLineCategoryData("won-lost", [
    { customerName: "Alpha", stage: "WON", finalDealValue: "1200" },
    { customerName: "Beta", stage: "WON", finalDealValue: "800" },
  ]);

  assert.deepEqual(points, [
    { name: "Alpha", value: 1200 },
    { name: "Beta", value: 800 },
  ]);
});

test("line chart disambiguates duplicate record labels and skips invalid metrics", () => {
  const points = buildLineCategoryData("won-lost", [
    { customerName: "Alpha", finalDealValue: 100 },
    { customerName: "Alpha", finalDealValue: 0 },
    { customerName: "Beta", finalDealValue: "invalid" },
  ]);

  assert.deepEqual(points, [
    { name: "Alpha", value: 100 },
    { name: "Alpha (2)", value: 0 },
  ]);
});

test("daily report trends aggregate duplicate dates and sort chronologically", () => {
  const trend = buildTrendData("revenue", [
    { stageEnteredAt: "2026-10-12T05:00:00.000Z", finalDealValue: "1250" },
    { stageEnteredAt: "2026-10-10T04:00:00.000Z", finalDealValue: 500 },
    { stageEnteredAt: "2026-10-12T08:00:00.000Z", finalDealValue: "750" },
    { stageEnteredAt: "2026-10-12T08:30:00.000Z", finalDealValue: null },
    { stageEnteredAt: "not-a-date", finalDealValue: 9000 },
  ]);

  assert.equal(trend.grain, "day");
  assert.deepEqual(
    trend.data.map(({ date, value }) => ({ date, value })),
    [
      { date: "2026-10-10", value: 500 },
      { date: "2026-10-12", value: 2000 },
    ],
  );
  assert.equal(trend.data.length, 2);
  assert.equal(trend.series[0].label, "Revenue");
});

test("date range selects weekly or monthly aggregation for long periods", () => {
  const rows = [
    { createdAt: "2025-01-02T12:00:00.000Z" },
    { createdAt: "2025-01-08T12:00:00.000Z" },
    { createdAt: "2025-03-02T12:00:00.000Z" },
  ];
  const weekly = buildTrendData("leads", rows, "2025-01-01", "2025-04-01");
  const monthly = buildTrendData("leads", rows, "2024-01-01", "2025-04-01");

  assert.equal(weekly.grain, "week");
  assert.equal(monthly.grain, "month");
  assert.deepEqual(
    monthly.data.map(({ date, value }) => ({ date, value })),
    [
      { date: "2025-01-01", value: 2 },
      { date: "2025-03-01", value: 1 },
    ],
  );
});

test("won/lost trends expose separate numeric series by outcome date", () => {
  const trend = buildTrendData("won-lost", [
    { stageEnteredAt: "2026-10-01T12:00:00.000Z", stage: "WON" },
    { stageEnteredAt: "2026-10-01T13:00:00.000Z", stage: "LOST" },
    { stageEnteredAt: "2026-10-02T12:00:00.000Z", stage: "WON" },
  ]);

  assert.deepEqual(trend.data.map(({ won, lost }) => ({ won, lost })), [
    { won: 1, lost: 1 },
    { won: 1, lost: 0 },
  ]);
  assert.deepEqual(
    trend.series.map(({ dataKey }) => dataKey),
    ["won", "lost"],
  );
  assert.deepEqual(trendDomain(trend, true), [0, 2.16]);
  assert.deepEqual(trendDomain(trend), [0, 1.08]);
});

test("single-point and empty trends retain only valid dated numeric metrics", () => {
  const single = buildTrendData("revenue", [
    { stageEnteredAt: "2026-10-21T12:00:00.000Z", finalDealValue: "-250" },
    { stageEnteredAt: "2026-10-21T13:00:00.000Z", finalDealValue: "invalid" },
    { stageEnteredAt: null, finalDealValue: 500 },
    { stageEnteredAt: "2026-02-31T12:00:00.000Z", finalDealValue: 1000 },
  ]);
  const empty = buildTrendData("leads", [
    { createdAt: "invalid" },
    { createdAt: null },
  ]);

  assert.equal(single.data.length, 1);
  assert.equal(single.data[0].value, -250);
  assert.equal(single.allowsNegative, true);
  assert.equal(empty.data.length, 0);
});

test("summary-only and current snapshot reports do not claim historical trends", () => {
  assert.equal(supportsTrend("monthly-summary"), false);
  assert.equal(supportsTrend("bde-performance"), false);
  assert.equal(supportsTrend("leads"), true);
});
