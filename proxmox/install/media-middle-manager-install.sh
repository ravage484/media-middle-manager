#!/usr/bin/env bash

# Copyright (c) 2021-2026 community-scripts ORG
# Author: ravage484
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/ravage484/media-middle-manager

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt install -y \
  build-essential \
  python3
msg_ok "Installed Dependencies"

NODE_VERSION="22" setup_nodejs

fetch_and_deploy_gh_release "media-middle-manager" "ravage484/media-middle-manager" "tarball"

msg_info "Building Media Middle Manager"
cd /opt/media-middle-manager || exit
$STD npm ci
$STD npm run build
$STD npm prune --omit=dev
mkdir -p /opt/media-middle-manager_data
msg_ok "Built Media Middle Manager"

msg_info "Creating Service"
cat <<EOF >/etc/systemd/system/media-middle-manager.service
[Unit]
Description=Media Middle Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/media-middle-manager
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=DATA_DIR=/opt/media-middle-manager_data
ExecStart=/usr/bin/node server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
systemctl enable -q --now media-middle-manager
msg_ok "Created Service"

motd_ssh
customize
cleanup_lxc
