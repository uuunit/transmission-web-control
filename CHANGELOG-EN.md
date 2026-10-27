# ChangeLog
### 2026.10.27 v1.7.0 (maintained fork)

Fork by [uuunit](https://github.com/uuunit) based on upstream v1.6.1-update1 (2020-09).
The original project was archived on 2025-06-01. This fork keeps the original UI and
PT-oriented workflow intact, and brings the codebase up to Transmission 4.x / RPC 17+.

* Added
	* Server-side labels (Transmission 4.0+): right-click "Server Labels…" to batch-set, a new "Server Labels" group in the left nav with click-to-filter. Unlike the pre-existing browser-local labels (localStorage), these live on the daemon and sync across clients. A graphical editor replaces the earlier prompt-based UI.
	* Sequential download (sequential_download): toggle in the torrent context menu (batch) and in the detail panel.
	* Bandwidth groups: a manager dialog (group-get / group-set) covering create/edit of speed limits + honors-session-limits, plus a combobox in the torrent detail panel.
	* Context-menu "Bandwidth Group" submenu: batch-assign a group to all checked torrents (with "None" to clear and a "Manage Groups…" entry).
	* Toast notification when "Edit Server Labels" is clicked with no torrent selected (instead of silently doing nothing).
	* Detail panel "Settings" tab gains: server labels, sequential download, isPrivate, maxConnectedPeers, and the bandwidth-group combo.
	* Capability detection via transmission.supports(), gated on rpc-version so older daemons keep their existing behaviour.
	* i18n entries for all 16 languages.

* Fixed
	* "serverlabel-" node ids contain the substring "label-", so the server-label filter branch must precede the local label branch.
	* torrent-get now requests labels, sequential_download, isPrivate, maxConnectedPeers, group, etaIdle, percentComplete, availability.
	* sequential_download is accepted only as snake_case by the daemon; camelCase returns nothing. Verified against Transmission 4.1.3.
	* group-get returns mixed-case keys (honorsSessionLimits camelCase, speed-limit-down kebab-case); selectGroup reads them with the correct style.

* Engineering
	* Reproducible build restored. The upstream repo ignored package.json and Gruntfile.js and shipped min/ as a hand-built artifact with no build config. build.js (terser, mangle:false to preserve the cross-file globals system/transmission/public) regenerates every bundle.
	* test-rpc.js: read-only RPC smoke test against a live daemon.
	* preview-server.py: static preview server with an RPC reverse proxy, so UI work does not require touching a production install.
	* Version 1.6.1 -> 1.7.0, cache busters unified to 20261027.

* Known limitation
	* New features are gated on rpc-version and need Transmission 4.0 (RPC 17) or newer; older daemons simply don't show them.
	* Transmission exposes no group-remove RPC, so bandwidth groups cannot be deleted through the UI once created. Removing one requires stopping the daemon and editing settings.json.

### 2018.03.30 v1.5.1-update2
* Fixed
	* Fix the torrent list to show misplaced bugs; Fixed #169 #170
	* Fix prompt text for some buttons in the torrent Properties window;
	* Fix right-click "Copy download location to clipboard" feature in the torrent list; #171
* Add
	* Add "Restore UI Default Settings" feature;
	* Add "Copy download location to clipboard" in Base>Download Dir ; #171

### 2018.03.29 v1.5.1-update1
* Fixed #165 #166 #167 #168

### 2018.03.28 v1.5.1
#### Note: The new update address will be enabled from this release, please download the installation script again. 

https://github.com/ronggang/transmission-web-control/blob/master/release/install-tr-control.sh

* [-] Delete the src.tar.gz files under this repository, and then no longer save the packaging documents under this repository; 

* [!] Fix the remaining time sorting error; fixed #161
* [!] Fix width of the "Config" window; Fixed #158
* [!] Fix parameter Configuration "Use schedule" when clicked, the Time input box status has no updated bug;

* [*] Update the installation script, the package file address points to the new repository;
* [*] Restore display of the list of BT servers, add parameters can be set; Close #161

* [+] Add the interface state memory function, cancel the "Auto expand attribute" function;
* [+] Add additional parameter setting options for configuring some parameters outside of TR's own function; 
* [+] Add the "Copy Save directory to clipboard" feature;

Before 2018
 - Updated the install tar file
 - Fixed several typos in English interface
 - Added http install script
 - Added install.sh with English comments
 - Updated easyui to 1.5.1 and jquery to 1.12.4 By -- @balonik
 - Fixed issue #20, #21, #23, #39, #40, #43, #44 #53 By -- @balonik
 - Replaced some Chinese comments to English
 - Fixed issue #77，#81 (Please clear your cookies if you encounter any error) By -- @balonik
 - Now the maximum number of torrents per page is 300，meanwhile, you can still modify the file config.js "pagination:true" to "pagination:false" in order to show ALL the torrents. By -- @balonik