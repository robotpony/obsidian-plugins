#!/bin/zsh

# g-command setup
# Installs rclone, configures a Google Drive remote, builds the MCP server,
# and registers it with Claude Code.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="${0:A:h}"
SERVER_DIST="$SCRIPT_DIR/src/gdrive/dist/index.js"
REMOTE="${GDRIVE_RCLONE_REMOTE:-gdrive}"

print_header() { echo "\n${BOLD}${BLUE}$1${NC}" }
print_success() { echo "${GREEN}✓${NC} $1" }
print_error()   { echo "${RED}✗${NC} $1" >&2 }
print_warn()    { echo "${YELLOW}!${NC} $1" }
print_info()    { echo "  $1" }

# --- rclone ---

check_rclone_installed() {
    command -v rclone &>/dev/null
}

install_rclone() {
    if ! command -v brew &>/dev/null; then
        print_error "Homebrew not found. Install rclone manually: https://rclone.org/install/"
        exit 1
    fi
    echo -n "Installing rclone via Homebrew... "
    brew install rclone &>/dev/null
    print_success "Done"
}

check_remote_configured() {
    rclone listremotes 2>/dev/null | grep -q "^${REMOTE}:$"
}

configure_remote() {
    echo ""
    print_info "Starting rclone config. In the wizard:"
    print_info "  n → new remote"
    print_info "  Name: ${BOLD}${REMOTE}${NC}"
    print_info "  Type: ${BOLD}drive${NC}"
    print_info "  Client ID / secret: leave blank"
    print_info "  Scope: ${BOLD}2${NC} (read-only)"
    print_info "  Root folder / service account: leave blank"
    print_info "  Advanced config: n"
    print_info "  Auto config: y  (browser opens — log in and click Allow)"
    print_info "  Team drive: n"
    echo ""
    echo -n "Press Enter to open rclone config... "
    read -r </dev/tty

    rclone config </dev/tty

    if ! check_remote_configured; then
        print_error "Remote \"${REMOTE}\" not found after config."
        print_info "Make sure you named the remote exactly: ${BOLD}${REMOTE}${NC}"
        print_info "Or re-run with: GDRIVE_RCLONE_REMOTE=your-name ./setup.sh"
        exit 1
    fi
}

verify_remote() {
    echo -n "Verifying Drive access... "
    if rclone lsjson "${REMOTE}:" --max-depth 1 --files-only &>/dev/null; then
        print_success "Connected"
    else
        print_error "Could not list files. Check that rclone config completed successfully."
        exit 1
    fi
}

# --- Build ---

build_server() {
    local server_dir="$SCRIPT_DIR/src/gdrive"
    echo -n "Installing npm dependencies... "
    (cd "$server_dir" && npm install &>/dev/null) || {
        print_error "npm install failed"
        exit 1
    }
    print_success "Done"

    echo -n "Building... "
    (cd "$server_dir" && npm run build &>/dev/null) || {
        print_error "Build failed. Run: cd src/gdrive && npm run build"
        exit 1
    }
    print_success "Done"
}

# --- Claude Code registration ---

claude_mcp_registered() {
    command -v claude &>/dev/null && claude mcp list 2>/dev/null | grep -q "^vault"
}

register_with_claude() {
    echo -n "Registering with Claude Code... "
    if claude mcp add vault node "$SERVER_DIST" &>/dev/null; then
        print_success "Registered"
    else
        print_warn "Could not register automatically."
        show_manual_registration
    fi
}

show_manual_registration() {
    echo ""
    print_info "Add this to ${BOLD}~/.claude/settings.json${NC} manually:"
    echo ""
    cat <<EOF
  {
    "mcpServers": {
      "vault": {
        "command": "node",
        "args": ["$SERVER_DIST"]
      }
    }
  }
EOF
    if [[ "$REMOTE" != "gdrive" ]]; then
        echo ""
        print_info "Also add to the vault server config:"
        print_info "  \"env\": { \"GDRIVE_RCLONE_REMOTE\": \"$REMOTE\" }"
    fi
}

# --- Main ---

main() {
    echo "${BOLD}${BLUE}g-command setup${NC}"
    echo "Sets up the Google Drive MCP server for Claude Code."

    # 1. rclone binary
    print_header "rclone"
    if check_rclone_installed; then
        print_success "rclone already installed ($(rclone --version | head -1))"
    else
        print_warn "rclone not found"
        echo -n "Install via Homebrew? [y/N] "
        read -r answer </dev/tty
        if [[ "$answer" =~ ^[Yy]$ ]]; then
            install_rclone
        else
            print_error "rclone is required. Install it and re-run this script."
            exit 1
        fi
    fi

    # 2. Drive remote
    print_header "Google Drive remote (\"${REMOTE}\")"
    if check_remote_configured; then
        print_success "Remote \"${REMOTE}\" already configured"
        verify_remote
    else
        print_warn "Remote \"${REMOTE}\" not found"
        configure_remote
        verify_remote
    fi

    # 3. Build
    print_header "Building MCP server"
    build_server

    # 4. Claude Code
    print_header "Claude Code registration"
    if claude_mcp_registered; then
        print_success "Already registered"
    elif command -v claude &>/dev/null; then
        register_with_claude
    else
        print_warn "claude CLI not found — register manually:"
        show_manual_registration
    fi

    echo ""
    print_success "${BOLD}Setup complete.${NC}"
    echo ""
    print_info "Verify in Claude Code:  /mcp"
    print_info "Then try:  search for a document by filename"
    echo ""
}

main "$@"
