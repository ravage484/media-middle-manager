#!/usr/bin/env bash
_cs_boot="${COMMUNITY_SCRIPTS_CORE_DIR:-$(dirname "${BASH_SOURCE[0]}")/../../core}/core/build.func"
source "$_cs_boot" 2>/dev/null || source <(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}/core/build.func")
# Copyright (c) 2021-2026 community-scripts ORG
# Author: ravage484
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/ravage484/media-middle-manager

APP="Media Middle Manager"
var_tags="${var_tags:-arr;media}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-4}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_arm64="${var_arm64:-no}"
var_unprivileged="${var_unprivileged:-1}"

# The engine only knows banners from its own repo and otherwise draws "Community Scripts"; this is ours instead.
_CS_FALLBACK_HEADER=' __  __ __  __ __  __
|  \/  |  \/  |  \/  |
| |\/| | |\/| | |\/| |
|_|  |_|_|  |_|_|  |_|'

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/media-middle-manager ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  # Security fixes come first and every time, even when the app itself has no new release: the operating system's packages, and the newest
  # patch of Node.js 22. A container installed on an older Node (20, which no longer gets fixes) is moved up to 22 here too.
  # Node 22 and not 24 on purpose: the database module (better-sqlite3 11.x) ships prebuilt binaries up to Node 22 only.
  export DEBIAN_FRONTEND=noninteractive
  local node_before node_after node_major_changed=0 app_updated=0
  node_before=$(node -v 2>/dev/null || true)

  msg_info "Updating system packages"
  $STD apt-get update
  $STD apt-get -y upgrade
  msg_ok "Updated system packages"

  NODE_VERSION="22" setup_nodejs
  node_after=$(node -v 2>/dev/null || true)
  # The database module is a compiled add-on, built for one Node version, so a new major version needs it rebuilt.
  if [[ "${node_before%%.*}" != "${node_after%%.*}" ]]; then node_major_changed=1; fi

  if check_for_gh_release "media-middle-manager" "ravage484/media-middle-manager"; then
    msg_info "Stopping Service"
    systemctl stop media-middle-manager
    msg_ok "Stopped Service"

    # Config and delete history live in /opt/media-middle-manager_data, outside the app folder, so they survive updates.
    fetch_and_deploy_gh_release "media-middle-manager" "ravage484/media-middle-manager" "tarball"

    msg_info "Building ${APP}"
    cd /opt/media-middle-manager || exit
    $STD npm ci
    $STD npm run build
    $STD npm prune --omit=dev
    msg_ok "Built ${APP}"

    msg_info "Starting Service"
    systemctl start media-middle-manager
    msg_ok "Started Service"
    msg_ok "Updated successfully!"
    app_updated=1
  fi

  if ((!app_updated)); then
    # No new release, but Node.js or the system changed underneath the running service: restart it so it runs on the fixed versions.
    msg_info "Restarting Service"
    systemctl stop media-middle-manager
    if ((node_major_changed)); then
      cd /opt/media-middle-manager || exit
      $STD npm rebuild better-sqlite3
    fi
    systemctl start media-middle-manager
    msg_ok "Restarted Service"
  fi
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3001${CL}"
