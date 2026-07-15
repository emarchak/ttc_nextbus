/**
 * Local smoke test for api/stops.js — mocks Vercel's (req, res) interface.
 * Usage: node scripts/test-api.mjs "queen and spadina"
 */
import handler from "../api/stops.js";

function mockRes() {
  const res = {
    headers: {},
    statusCode: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      console.log(`HTTP ${this.statusCode}`);
      console.log(JSON.stringify(payload, null, 2));
      return this;
    },
    end() {
      console.log(`HTTP ${this.statusCode} (empty)`);
      return this;
    },
  };
  return res;
}

const query = process.argv[2] ?? "";
await handler({ method: "POST", body: { query }, query: {} }, mockRes());
