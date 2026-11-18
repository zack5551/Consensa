// A tiny stand-in for Supabase's REST API, used only by the World/VPN e2e test. It answers the two crowd functions
// with fixed numbers so the question page can show live data. Nothing else is served.
import { createServer } from "node:http";

const port = Number(process.env.MOCK_SUPABASE_PORT ?? 3102);

const answers = {
  // Canada: enough people to show a number.
  crowd_summary: [{ slug: "boc-cut-dec-2026", region: null, locale: null, n: 40, total: 1600 }],
  // World/VPN: 12 calls averaging 58% on one question, 3 calls (under the floor of 5) on another.
  crowd_world_vpn: [
    { slug: "boc-cut-dec-2026", n: 12, total: 696 },
    { slug: "giller-debut-2026", n: 3, total: 150 },
  ],
};

createServer((req, res) => {
  const name = (req.url ?? "").split("?")[0]?.split("/").pop() ?? "";
  req.resume();
  req.on("end", () => {
    const body = answers[name];
    res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body ?? { message: "not mocked" }));
  });
}).listen(port, "127.0.0.1");
