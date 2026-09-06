import assert from "node:assert/strict";
import { FundRockPieUnitPriceProvider } from "../apps/jobs/src/providers/FundRockPieUnitPriceProvider";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  let requestedUrl = "";
  const provider = new FundRockPieUnitPriceProvider({
    fetchFn: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        async text() {
          return fundRockHtml();
        }
      };
    }
  });

  const result = await provider.fetchLatestPrices({
    fetchedAt: "2026-05-23T01:00:00.000Z",
    instruments: [
      {
        sourceSymbol: "FS_NASDAQ_100",
        providerInstrumentName: "Foundation Series Nasdaq-100 Fund",
        currency: "NZD"
      },
      {
        sourceSymbol: "FS_TOTAL_WORLD",
        providerInstrumentName: "Foundation Series Total World Fund",
        currency: "NZD"
      },
      {
        sourceSymbol: "FS_US_500",
        providerInstrumentName: "Foundation Series US 500 Fund",
        currency: "NZD"
      }
    ]
  });

  assert.equal(requestedUrl, "https://www.fundrock.com/fundrock-new-zealand/frnz-documents-and-reporting/");
  assert.equal(result.provider, "FundRock");
  assert.equal(result.fetchedAt, "2026-05-23T01:00:00.000Z");
  assert.deepEqual(result.prices, [
    {
      sourceSymbol: "FS_NASDAQ_100",
      priceDate: "2026-05-21",
      closePrice: "1.3895",
      currency: "NZD"
    },
    {
      sourceSymbol: "FS_TOTAL_WORLD",
      priceDate: "2026-05-21",
      closePrice: "1.986",
      currency: "NZD"
    },
    {
      sourceSymbol: "FS_US_500",
      priceDate: "2026-05-21",
      closePrice: "2.0731",
      currency: "NZD"
    }
  ]);

  await assert.rejects(
    new FundRockPieUnitPriceProvider({
      fetchFn: async () => ({
        ok: true,
        status: 200,
        async text() {
          return fundRockHtml().replace("Foundation Series US 500 Fund", "Foundation Series Missing Fund");
        }
      })
    }).fetchLatestPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      instruments: [
        {
          sourceSymbol: "FS_US_500",
          providerInstrumentName: "Foundation Series US 500 Fund",
          currency: "NZD"
        }
      ]
    }),
    /missing/
  );

  await assert.rejects(
    new FundRockPieUnitPriceProvider({
      fetchFn: async () => ({
        ok: true,
        status: 200,
        async text() {
          return fundRockHtml().replaceAll("<td>05/21/2026</td>", "<td>05/32/2026</td>");
        }
      })
    }).fetchLatestPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      instruments: [
        {
          sourceSymbol: "FS_NASDAQ_100",
          providerInstrumentName: "Foundation Series Nasdaq-100 Fund",
          currency: "NZD"
        }
      ]
    }),
    /date is invalid/
  );

  await assert.rejects(
    new FundRockPieUnitPriceProvider({
      fetchFn: async () => ({
        ok: true,
        status: 200,
        async text() {
          return fundRockHtml().replace("<td>1.3895</td>", "<td>0</td>");
        }
      })
    }).fetchLatestPrices({
      fetchedAt: "2026-05-23T01:00:00.000Z",
      instruments: [
        {
          sourceSymbol: "FS_NASDAQ_100",
          providerInstrumentName: "Foundation Series Nasdaq-100 Fund",
          currency: "NZD"
        }
      ]
    }),
    /must be positive/
  );

  for (const [rawDate, expected] of [["9/3/2026", "2026-09-03"], ["8/28/2026", "2026-08-28"], ["2026-09-03", "2026-09-03"]]) {
    const parsed = await new FundRockPieUnitPriceProvider({
      fetchFn: async () => ({ ok: true, status: 200, text: async () => fundRockHtml().replaceAll("05/21/2026", rawDate) })
    }).fetchLatestPrices({
      fetchedAt: "2026-09-06T01:00:00.000Z",
      instruments: [{ sourceSymbol: "FS_US_500", providerInstrumentName: "Foundation Series US 500 Fund", currency: "NZD" }]
    });
    assert.equal(parsed.prices[0].priceDate, expected);
  }

  await assert.rejects(new FundRockPieUnitPriceProvider({
    fetchFn: async () => ({ ok: true, status: 200, text: async () => fundRockHtml().replaceAll("05/21/2026", "10/8/2026") })
  }).fetchLatestPrices({
    fetchedAt: "2026-09-06T01:00:00.000Z",
    instruments: [{ sourceSymbol: "FS_US_500", providerInstrumentName: "Foundation Series US 500 Fund", currency: "NZD" }]
  }), /in the future/);

  console.log("FundRock provider verification: success");
}

function fundRockHtml(): string {
  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Date</th>
          <th>Unit Price</th>
          <th>Buy price</th>
          <th>Sell Price</th>
          <th>Net Asset Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Unrelated PIE Fund</td>
          <td>05/21/2026</td>
          <td>9.9999</td>
          <td>9.9999</td>
          <td>9.9999</td>
          <td>$1.00</td>
        </tr>
        <tr>
          <td>Foundation Series Nasdaq-100 Fund</td>
          <td>05/21/2026</td>
          <td>1.3895</td>
          <td>1.3895</td>
          <td>1.3895</td>
          <td>$37,129,044.00</td>
        </tr>
        <tr>
          <td>Foundation Series Total World Fund</td>
          <td>05/21/2026</td>
          <td>1.986</td>
          <td>1.986</td>
          <td>1.986</td>
          <td>$621,879,633.00</td>
        </tr>
        <tr>
          <td>Foundation Series US 500 Fund</td>
          <td>05/21/2026</td>
          <td>2.0731</td>
          <td>2.0731</td>
          <td>2.0731</td>
          <td>$275,380,825.00</td>
        </tr>
      </tbody>
    </table>
  `;
}
