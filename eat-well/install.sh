#!/bin/zsh

# Eat Well Obsidian Plugin Installer
# Builds and installs the plugin into one or more vaults.
#
# Extra files beyond the standard main.js / manifest.json / styles.css:
#   sql-wasm.wasm  — SQLite WASM runtime (copied from node_modules/sql.js/dist/)
#   ew.db          — pre-built nutrition database (~77 MB, download separately)
#
# Usage:
#   ./install.sh              # interactive: select vaults
#   ./install.sh -p           # use previously-selected vaults
#   ./install.sh -d 6         # search for vaults up to depth 6

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="${0:A:h}"
CONFIG_FILE="$SCRIPT_DIR/.install-vaults"
SPINNER_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
typeset -ga SELECTED_ITEMS

USE_PREVIOUS_VAULTS=false
SEARCH_DEPTH=""

show_help() {
    echo "Usage: ./install.sh [options]"
    echo ""
    echo "Options:"
    echo "  -p, --previous   Use previously selected vaults"
    echo "  -d, --depth N    Override vault search depth"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Prerequisites:"
    echo "  npm run build    must have been run first"
    echo "  ew.db            must exist in this directory (download from GitHub releases)"
}

print_header()  { echo "\n${BOLD}${BLUE}$1${NC}"; }
print_success() { echo "${GREEN}✓${NC} $1"; }
print_error()   { echo "${RED}✗${NC} $1" >&2; }
print_warn()    { echo "${YELLOW}!${NC} $1"; }

print_spinner() {
    printf "\r\033[K  ${CYAN}${SPINNER_FRAMES[$1]}${NC} %s" "$2" >&2
}
clear_spinner() { printf "\r\033[K" >&2; }

show_error_block() {
    local title="$1" output="$2"
    echo ""
    echo "  ${RED}┌─ ${title} ─────────────────────────────────${NC}"
    echo "$output" | while IFS= read -r line; do
        echo "  ${RED}│${NC} $line"
    done
    echo "  ${RED}└────────────────────────────────────────────${NC}"
}

# --- Vault discovery ---

find_vaults() {
    local -a vaults searched_paths
    local frame=0
    local -a search_configs=(
        "$HOME/Documents:4"
        "$HOME/Desktop:3"
        "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents:4"
        "$HOME:5"
    )

    for config in "${search_configs[@]}"; do
        local search_path="${config%:*}"
        local max_depth="${config#*:}"
        [[ -n "$SEARCH_DEPTH" ]] && max_depth="$SEARCH_DEPTH"
        [[ -d "$search_path" ]] || continue

        local skip=false
        for searched in "${searched_paths[@]}"; do
            [[ "$search_path" == "$searched"/* ]] && skip=true && break
        done
        $skip && continue

        print_spinner $frame "Searching ${search_path/#$HOME/~}..."
        frame=$(( (frame + 1) % ${#SPINNER_FRAMES[@]} ))

        while IFS= read -r obsidian_dir; do
            [[ -z "$obsidian_dir" ]] && continue
            local vault_dir="${obsidian_dir:h}"
            local is_dup=false
            for existing in "${vaults[@]}"; do
                [[ "$existing" == "$vault_dir" ]] && is_dup=true && break
            done
            $is_dup || vaults+=("$vault_dir")
        done < <(find "$search_path" -maxdepth "$max_depth" -type d -name ".obsidian" 2>/dev/null)

        searched_paths+=("$search_path")
    done

    clear_spinner
    print -l "${vaults[@]}"
}

load_cached_vaults() {
    [[ -f "$CONFIG_FILE" ]] || return 1
    local -a cached
    while IFS= read -r line; do
        [[ -d "$line/.obsidian" ]] && cached+=("$line")
    done < "$CONFIG_FILE"
    [[ ${#cached[@]} -gt 0 ]] || return 1
    print -l "${cached[@]}"
}

save_vaults_to_cache() { print -l "$@" > "$CONFIG_FILE"; }

# --- Interactive selection ---

select_items() {
    local prompt="$1"; shift
    local -a items=("$@")
    local count=${#items[@]}
    SELECTED_ITEMS=()
    [[ $count -eq 0 ]] && return 1

    echo "  ${BOLD}0)${NC} ${CYAN}All${NC}"
    for i in {1..$count}; do echo "  ${BOLD}$i)${NC} ${items[$i]}"; done
    echo ""
    echo -n "$prompt (0 for all, or space-separated numbers): "
    read -r selection </dev/tty

    if [[ "$selection" == "0" || "$selection" == "all" ]]; then
        SELECTED_ITEMS=("${items[@]}")
    else
        for num in ${=selection}; do
            if [[ "$num" =~ ^[0-9]+$ ]] && [[ $num -ge 1 ]] && [[ $num -le $count ]]; then
                SELECTED_ITEMS+=("${items[$num]}")
            fi
        done
    fi
}

# --- Build ---

build_plugin() {
    echo -n "Building eat-well... "
    [[ -f "$SCRIPT_DIR/package.json" ]] || { print_error "No package.json"; return 1; }

    local output
    output=$( (cd "$SCRIPT_DIR" && npm install 2>&1) ) || {
        print_error "npm install failed"; show_error_block "npm install" "$output"; return 1
    }
    output=$( (cd "$SCRIPT_DIR" && npm run build 2>&1) ) || {
        print_error "Build failed"; show_error_block "npm run build" "$output"; return 1
    }
    print_success "Done"
}

# --- Install ---

install_into_vault() {
    local vault_dir="$1"
    local target="$vault_dir/.obsidian/plugins/eat-well"
    mkdir -p "$target"

    # Standard plugin files
    local copied=0
    for f in main.js manifest.json styles.css; do
        if [[ -f "$SCRIPT_DIR/$f" ]]; then
            cp "$SCRIPT_DIR/$f" "$target/"
            (( copied++ )) || true
        fi
    done
    [[ $copied -eq 0 ]] && { print_error "No files to install (missing main.js?)"; return 1; }

    # sql.js WASM runtime — required alongside main.js
    local wasm_src="$SCRIPT_DIR/node_modules/sql.js/dist/sql-wasm.wasm"
    if [[ -f "$wasm_src" ]]; then
        cp "$wasm_src" "$target/"
    else
        print_warn "sql-wasm.wasm not found at $wasm_src — run npm install first"
    fi

    # Nutrition database — large binary, not in git; must be present
    local db_src="$SCRIPT_DIR/ew.db"
    if [[ -f "$db_src" ]]; then
        cp "$db_src" "$target/"
    else
        print_warn "ew.db not found — download from GitHub releases and place in $SCRIPT_DIR"
    fi

    local display="${target/#$HOME/~}"
    print_success "$display"
}

# --- Main ---

main() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--previous) USE_PREVIOUS_VAULTS=true; shift ;;
            -d|--depth)
                [[ "$2" =~ ^[0-9]+$ ]] || { print_error "-d requires a number"; exit 1; }
                SEARCH_DEPTH="$2"; shift 2 ;;
            -h|--help) show_help; exit 0 ;;
            *) print_error "Unknown option: $1"; show_help; exit 1 ;;
        esac
    done

    echo "${BOLD}${BLUE}Eat Well — Plugin Installer${NC}"

    # Build
    print_header "Building..."
    build_plugin || exit 1

    # Vaults
    local -a vaults_to_install

    if [[ "$USE_PREVIOUS_VAULTS" == "true" ]]; then
        while IFS= read -r line; do
            [[ -n "$line" ]] && vaults_to_install+=("$line")
        done < <(load_cached_vaults 2>/dev/null)

        if [[ ${#vaults_to_install[@]} -eq 0 ]]; then
            print_error "No cached vaults. Run without --previous first."; exit 1
        fi
        print_header "Using ${#vaults_to_install[@]} cached vaults:"
        for v in "${vaults_to_install[@]}"; do echo "  ${v/#$HOME/~}"; done
    else
        print_header "Searching for Obsidian vaults..."
        local -a vault_dirs
        while IFS= read -r line; do
            [[ -n "$line" ]] && vault_dirs+=("$line")
        done < <(find_vaults)

        if [[ ${#vault_dirs[@]} -eq 0 ]]; then
            print_error "No vaults found"; exit 1
        fi

        local -a vault_names
        for dir in "${vault_dirs[@]}"; do vault_names+=("${dir/#$HOME/~}"); done

        print_header "Found ${#vault_dirs[@]} vaults:"
        select_items "Select vaults" "${vault_names[@]}"

        for selected in "${SELECTED_ITEMS[@]}"; do
            for i in {1..${#vault_names[@]}}; do
                if [[ "${vault_names[$i]}" == "$selected" ]]; then
                    vaults_to_install+=("${vault_dirs[$i]}")
                    break
                fi
            done
        done

        [[ ${#vaults_to_install[@]} -gt 0 ]] && save_vaults_to_cache "${vaults_to_install[@]}"
    fi

    if [[ ${#vaults_to_install[@]} -eq 0 ]]; then
        print_warn "No vaults selected"; exit 0
    fi

    print_header "Installing into ${#vaults_to_install[@]} vault(s)..."
    for vault_dir in "${vaults_to_install[@]}"; do
        echo -n "  "
        install_into_vault "$vault_dir"
    done

    echo ""
    print_success "${BOLD}Done.${NC} Reload Obsidian to activate."
}

main "$@"
