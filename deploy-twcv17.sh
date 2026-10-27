#!/bin/bash
#
# deploy-twcv17.sh — install / back up / roll back Transmission Web Control
#                    (v1.7 maintained fork) on a Synology NAS.
#
# Run this ON THE SYNOLOGY, via SSH, as root (or with sudo).
#
#   ./deploy-twcv17.sh status     # show detected web dir, current version, backups
#   ./deploy-twcv17.sh backup     # snapshot the current web dir
#   ./deploy-twcv17.sh deploy     # snapshot, then install v1.7 from GitHub
#   ./deploy-twcv17.sh rollback   # restore the most recent snapshot
#   ./deploy-twcv17.sh list       # list snapshots
#
# Nothing beyond the web UI directory is touched: no daemon config, no
# settings.json, no network settings.
#
set -uo pipefail

REPO_TARBALL="https://github.com/uuunit/transmission-web-control/archive/refs/heads/v1.7-transmission-4x.tar.gz"
BACKUP_ROOT=""          # resolved in detect_web_dir()
WEB_DIR=""

c_red()   { printf "\033[31m%s\033[0m\n" "$*"; }
c_green() { printf "\033[32m%s\033[0m\n" "$*"; }
c_yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
die()     { c_red "ERROR: $*"; exit 1; }

require_root() {
	[ "$(id -u)" -eq 0 ] || die "must run as root (try: sudo $0 $*)"
}

# Locate the directory Transmission actually serves as its web UI.
# Candidates are tried in order; the first one holding index.html wins.
detect_web_dir() {
	local candidates=(
		"/var/packages/transmission/target/share/transmission/public_html"
		"/var/packages/transmission/target/share/transmission/web"
		"/volume1/@appdata/transmission/public_html"
		"/volume1/@appdata/transmission/web"
		"/usr/local/transmission/share/transmission/web"
	)
	for d in "${candidates[@]}"; do
		if [ -f "$d/index.html" ]; then
			WEB_DIR="$d"
			BACKUP_ROOT="$(dirname "$d")"
			return 0
		fi
	done
	# Fall back: search under the package + appdata roots (bounded depth).
	for root in /var/packages/transmission /volume1/@appdata/transmission; do
		[ -d "$root" ] || continue
		local found
		found=$(find "$root" -maxdepth 5 -type f -name index.html 2>/dev/null | head -1)
		if [ -n "$found" ]; then
			WEB_DIR="$(dirname "$found")"
			BACKUP_ROOT="$(dirname "$WEB_DIR")"
			return 0
		fi
	done
	return 1
}

owned_by_sc() {
	# Synology transmission package runs as sc-transmission:synocommunity.
	id sc-transmission >/dev/null 2>&1 || return 1
	return 0
}

cmd_status() {
	echo "== web dir =="
	if detect_web_dir; then
		c_green "$WEB_DIR"
	else
		c_yellow "not found — is Transmission installed?"
		return 1
	fi

	echo
	echo "== current version =="
	local sysjs="$WEB_DIR/tr-web-control/script/min/system.min.js"
	if [ -f "$sysjs" ]; then
		local ver upd
		ver=$(grep -o 'version:"[^"]*"' "$sysjs" | head -1 | cut -d'"' -f2)
		upd=$(grep -o 'codeupdate:"[^"]*"' "$sysjs" | head -1 | cut -d'"' -f2)
		echo "  Web Control : ${ver:-unknown} (${upd:-unknown})"
	else
		echo "  not a TWC installation (no system.min.js)"
	fi

	# Daemon version via RPC (needs no session id for this probe).
	if command -v curl >/dev/null 2>&1; then
		local out
		out=$(curl -s -m 4 http://127.0.0.1:9091/transmission/rpc 2>/dev/null | grep -o 'Transmission [0-9][^<]*' | head -1)
		[ -n "$out" ] && echo "  Daemon      : $out"
	fi

	echo
	echo "== snapshots =="
	cmd_list
}

cmd_list() {
	if ! detect_web_dir; then return 1; fi
	local found=0
	for d in "${BACKUP_ROOT}"/$(basename "$WEB_DIR").bak-*; do
		[ -d "$d" ] || continue
		found=1
		printf "  %s  (%s)\n" "$d" "$(du -sh "$d" 2>/dev/null | cut -f1)"
	done
	[ "$found" -eq 0 ] && echo "  (none)"
}

cmd_backup() {
	[ -n "$1" ] && { WEB_DIR="$1"; BACKUP_ROOT="$(dirname "$1")"; }
	detect_web_dir || die "web dir not found"
	local stamp dest
	stamp=$(date +%Y%m%d-%H%M%S)
	dest="${WEB_DIR}.bak-${stamp}"
	cp -a "$WEB_DIR" "$dest" || die "backup failed"
	c_green "backed up -> $dest" >&2
	echo "$dest"
}

cmd_deploy() {
	detect_web_dir || die "web dir not found"
	echo "web dir : $WEB_DIR"
	c_yellow "1/4 backing up current UI …"
	local backup
	backup=$(cmd_backup) || die "backup failed — aborting (nothing changed)"
	echo

	c_yellow "2/4 downloading v1.7 …"
	local tmp
	tmp=$(mktemp -d /tmp/twcv17.XXXXXX) || die "mktemp failed"
	cd "$tmp" || die "cd failed"
	if ! curl -fsSL -o twc.tar.gz "$REPO_TARBALL"; then
		rm -rf "$tmp"
		die "download failed (check network). Nothing was changed."
	fi
	tar -xzf twc.tar.gz || { rm -rf "$tmp"; die "extract failed. Nothing was changed."; }
	local src
	src=$(find . -maxdepth 3 -type d -path '*/src' | head -1)
	[ -n "$src" ] || { rm -rf "$tmp"; die "unexpected archive layout. Nothing was changed."; }

	c_yellow "3/4 installing files …"
	# Keep the old directory as the backup; replace contents wholesale so
	# stale files from the previous UI cannot linger.
	rm -rf "$WEB_DIR"
	mkdir -p "$WEB_DIR"
	cp -a "$src"/. "$WEB_DIR"/ || { rm -rf "$tmp"; die "copy failed — restore from: $backup"; }

	c_yellow "4/4 fixing ownership …"
	if owned_by_sc; then
		chown -R sc-transmission:synocommunity "$WEB_DIR"
		c_green "  owner set to sc-transmission:synocommunity"
	else
		c_yellow "  sc-transmission user not found; left ownership untouched"
	fi

	chmod -R a+rX "$WEB_DIR"
	rm -rf "$tmp"

	echo
	c_green "done."
	echo "  rollback : sudo $0 rollback"
	echo "  then hard-refresh the browser (Ctrl/Cmd+Shift+R)"
}

cmd_rollback() {
	detect_web_dir || die "web dir not found"
	# Pick the newest snapshot.
	local latest=""
	for d in "${BACKUP_ROOT}"/$(basename "$WEB_DIR").bak-*; do
		[ -d "$d" ] || continue
		if [ -z "$latest" ] || [ "$d" \> "$latest" ]; then
			latest="$d"
		fi
	done
	[ -n "$latest" ] || die "no snapshot found under $BACKUP_ROOT"

	echo "restoring : $latest"
	echo "        -> : $WEB_DIR"
	printf "continue? [y/N] "
	read -r ans
	case "$ans" in
		y|Y) ;;
		*) echo "aborted"; exit 0 ;;
	esac

	rm -rf "$WEB_DIR"
	cp -a "$latest" "$WEB_DIR" || die "restore failed — snapshot is still at $latest"
	if owned_by_sc; then chown -R sc-transmission:synocommunity "$WEB_DIR"; fi
	c_green "rolled back."
}

case "${1:-}" in
	status)   require_root "$@"; cmd_status ;;
	backup)   require_root "$@"; cmd_backup ;;
	deploy)   require_root "$@"; cmd_deploy ;;
	rollback) require_root "$@"; cmd_rollback ;;
	list)     require_root "$@"; cmd_list ;;
	*)
		sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
		exit 1
		;;
esac
