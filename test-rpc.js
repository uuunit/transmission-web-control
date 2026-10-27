#!/usr/bin/env node
/**
 * Live RPC smoke test against a running Transmission daemon.
 *
 * Verifies that the fields/methods TWC 1.7 relies on actually work on the
 * connected daemon. Read-only: it never mutates torrent or session state.
 *
 * Usage: node test-rpc.js [host:port]
 */

const HOST = process.argv[2] || "192.168.1.2:9091";
const RPC_URL = `http://${HOST}/transmission/rpc`;

let sessionId = "";

async function rpc(method, args) {
  const body = { method };
  if (args) body.arguments = args;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionId ? { "X-Transmission-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      sessionId = res.headers.get("X-Transmission-Session-Id");
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error("could not obtain session id");
}

// Fields TWC 1.7 requests in torrent-get base/status sets
const NEW_TORRENT_FIELDS = [
  "id", "name",
  "labels",             // Transmission 4.0 server-side labels
  "sequential_download",// snake_case ONLY (camelCase returns nothing)
  "isPrivate",
  "maxConnectedPeers",
  "group",
  "etaIdle",
  "percentComplete",
  "availability",
  "bandwidthPriority",
  "honorsSessionLimits",
];

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  console.log(`Target: ${RPC_URL}\n`);

  // 1. session-get
  console.log("[1] session-get");
  const s = await rpc("session-get");
  const cfg = s.arguments || {};
  const rpcVersion = parseInt(cfg["rpc-version"], 10);
  check("rpc-version readable", !isNaN(rpcVersion), `= ${rpcVersion}`);
  check("version string", !!cfg["version"], cfg["version"]);
  check("supports bandwidthGroups (rpc>=17)", rpcVersion >= 17, String(rpcVersion >= 17));

  // 2. torrent-get with the new field set
  console.log("\n[2] torrent-get (new 4.x fields)");
  const all = await rpc("torrent-get", { fields: ["id"] });
  const ids = (all.arguments.torrents || []).map((t) => t.id);
  check("torrent list", ids.length > 0, `${ids.length} torrents`);

  if (ids.length) {
    const sample = ids[0];
    const t = await rpc("torrent-get", { fields: NEW_TORRENT_FIELDS, ids: [sample] });
    const tor = (t.arguments.torrents || [])[0] || {};

    for (const f of NEW_TORRENT_FIELDS) {
      if (f === "id" || f === "name") continue;
      const present = Object.prototype.hasOwnProperty.call(tor, f);
      let detail = present ? JSON.stringify(tor[f]).slice(0, 40) : "(not returned)";
      check(`field: ${f}`, present, detail);
    }
  }

  // 3. group-get
  console.log("\n[3] group-get (bandwidth groups, RPC 17+)");
  const g = await rpc("group-get");
  check("group-get success", g.result === "success", g.result);
  const groups = g.arguments && g.arguments.group;
  check("group array present", Array.isArray(groups), `${Array.isArray(groups) ? groups.length : "?"} groups`);
  if (Array.isArray(groups) && groups.length) {
    const keys = Object.keys(groups[0]);
    console.log(`     group object keys: ${keys.join(", ")}`);
  }

  // 4. free-space (TWC relies on this for rpc>=15)
  console.log("\n[4] free-space");
  const fs = await rpc("free-space", { path: cfg["download-dir"] || "/" });
  check("free-space works", fs.result === "success",
    fs.arguments ? `${fs.arguments["size-bytes"]} bytes` : "");

  // summary
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(50)}`);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    failed.forEach((f) => console.log(`  - ${f.name}`));
    process.exit(1);
  }
  console.log("All checks passed.");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
