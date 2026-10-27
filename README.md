<p align="center">
<img src="https://github.com/ronggang/transmission-web-control/raw/master/src/tr-web-control/logo.png"><br/>
<img src="https://img.shields.io/badge/transmission-%3E%3D2.40%20(RPC%20%3E14)-green.svg" title="Support Transmission Version">
<img src="https://img.shields.io/badge/fork-Transmission%204.x%20%2F%20RPC%2019-blue.svg" title="Fork focus">
<a href="LICENSE" title="license"><img src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

----

# Transmission Web Control — maintained fork

This is a **maintained fork** of [ronggang/transmission-web-control](https://github.com/ronggang/transmission-web-control)
(the original "Transmission Web Control" / TWC by 栽培者), which was **archived on 2025-06-01**.

The upstream project served PT users well for years, but its final release (v1.6.1, 2020-09)
predates Transmission 4.x. This fork keeps the UI and workflow people are used to, and brings
it up to date with the modern RPC API.

## What this fork adds

**Transmission 4.x / RPC 17+ support**

| Feature | Status | Notes |
|---|---|---|
| Server-side labels | ✅ | `labels` on the torrent, stored in the daemon and shared across clients. The original TWC "labels" were browser-local only. |
| Sequential download | ✅ | Per-torrent toggle (right-click) plus read/write in the detail panel |
| Bandwidth groups | ✅ | `group-get` / `group-set` wrappers; per-torrent `group` binding shown |
| Private torrent flag | ✅ | `isPrivate` shown in the detail panel |
| Per-torrent max peers | ✅ | `maxConnectedPeers` editable |
| Availability / ETA-idle / percent-complete | ✅ | Requested and available to the UI |
| Capability detection | ✅ | `transmission.supports()` gates every new feature by `rpc-version`, so older daemons keep working |
| Reproducible build | ✅ | The original repo shipped `min/` with no build config; `node build.js` now regenerates it |

Everything else — the layout, the PT-oriented tracker grouping, the batch operations — is
intentionally unchanged. If you are used to TWC, this should feel identical, with a few new
options in the right places.

## Requirements

* Transmission **2.40+** (RPC >= 14). Transmission **4.x** unlocks the new features listed above.
* A modern browser. No build step is required to *use* the UI — only to modify it.

## Install

Same as upstream: copy the contents of `src/` into the directory Transmission serves as its web UI.
For a Synology `transmission` package that is typically:

```sh
cd /var/packages/transmission/target/share/transmission/
rm -rf public_html
cp -r /path/to/src public_html
chown -R sc-transmission:synocommunity public_html
```

Or point Transmission at the directory:

```sh
TRANSMISSION_WEB_HOME=/path/to/src transmission-daemon
```

## Develop

```sh
npm install          # installs terser
node build.js        # regenerate src/tr-web-control/script/min/*.min.js
node build.js --check  # syntax-check the generated bundles without writing

node test-rpc.js 192.168.1.2:9091   # read-only smoke test against a live daemon
python3 preview-server.py --port 8901 --upstream 192.168.1.2:9091
# then open http://127.0.0.1:8901/   (binds 0.0.0.0 by default; pass --host 127.0.0.1 to restrict)
```

`preview-server.py` serves the local `src/` tree and proxies `/rpc` to a real daemon, so you can
iterate without touching a production install. It bypasses `HTTP_PROXY` on purpose — LAN RPC
through a proxy returns 502.

Source files live in `src/tr-web-control/script/*.js` (unminified). The page loads the minified
bundles from `script/min/`, so **any source change requires a rebuild**.

## Deploy to Synology

`deploy-twcv17.sh` is a small helper for the NAS itself (run it there, over SSH, as root):

```sh
sudo ./deploy-twcv17.sh status     # detect the served web dir + show current versions
sudo ./deploy-twcv17.sh backup     # timestamped snapshot next to the web dir
sudo ./deploy-twcv17.sh deploy     # snapshot, download this fork from GitHub, replace, fix ownership
sudo ./deploy-twcv17.sh rollback   # restore the newest snapshot (asks for confirmation)
sudo ./deploy-twcv17.sh list       # list snapshots
```

`deploy` always snapshots first and aborts if the download or extraction fails, so a bad deploy
never destroys the working install. It touches **only** the web directory — no `settings.json`,
no daemon config, no network settings.

## Credits

* Original project and UI: [栽培者 (ronggang)](https://github.com/ronggang) and contributors — archived 2025-06
* This fork: [uuunit](https://github.com/uuunit)

Licensed under the MIT license, same as upstream. See [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
