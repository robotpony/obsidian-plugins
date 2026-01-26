#!/bin/zsh

# Obsidian Plugin Installer
# Discovers vaults and plugins, builds and installs interactively

set -e

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No colour

SCRIPT_DIR="${0:A:h}"
CONFIG_FILE="$SCRIPT_DIR/.install-vaults"

# Spinner frames
SPINNER_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

# Global to return selections (avoiding subshell issues with read)
typeset -ga SELECTED_ITEMS

# Command line options
USE_ALL_PLUGINS=false
USE_PREVIOUS_VAULTS=false

show_help() {
    echo "Usage: ./install.sh [options]"
    echo ""
    echo "Options:"
    echo "  -a, --all        Install all plugins (skip plugin prompt)"
    echo "  -p, --previous   Use previously selected vaults (skip vault prompt)"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./install.sh -a -p   Quick reinstall: all plugins to cached vaults"
    echo ""
    echo "Interactive prompts:"
    echo "  0        Select all items"
    echo "  1 2 3    Space-separated numbers for specific items"
}

# --- Helper functions ---

print_header() {
    echo "\n${BOLD}${BLUE}$1${NC}"
}

print_success() {
    echo "${GREEN}✓${NC} $1"
}

print_error() {
    echo "${RED}✗${NC} $1" >&2
}

print_warn() {
    echo "${YELLOW}!${NC} $1"
}

print_spinner() {
    local frame=$1
    local message=$2
    printf "\r\033[K  ${CYAN}${SPINNER_FRAMES[$frame]}${NC} %s" "$message" >&2
}

clear_spinner() {
    printf "\r\033[K" >&2
}

# --- Discovery functions ---

find_plugins() {
    local -a plugins
    for dir in "$SCRIPT_DIR"/*/; do
        if [[ -f "${dir}manifest.json" ]]; then
            plugins+=("${dir%/}")
        fi
    done
    print -l "${plugins[@]}"
}

get_plugin_info() {
    local plugin_dir="$1"
    local name=$(basename "$plugin_dir")
    local version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$plugin_dir/manifest.json" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    echo "$name (v$version)"
}

find_vaults() {
    local -a vaults
    local -a searched_paths
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

        [[ -d "$search_path" ]] || continue

        local skip=false
        for searched in "${searched_paths[@]}"; do
            if [[ "$search_path" == "$searched"/* ]]; then
                skip=true
                break
            fi
        done
        $skip && continue

        local display_path="${search_path/#$HOME/~}"
        print_spinner $frame "Searching ${display_path}..."
        frame=$(( (frame + 1) % ${#SPINNER_FRAMES[@]} ))

        while IFS= read -r obsidian_dir; do
            [[ -z "$obsidian_dir" ]] && continue
            local vault_dir="${obsidian_dir:h}"

            local is_dup=false
            for existing in "${vaults[@]}"; do
                if [[ "$existing" == "$vault_dir" ]]; then
                    is_dup=true
                    break
                fi
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

save_vaults_to_cache() {
    print -l "$@" > "$CONFIG_FILE"
}

# --- Selection functions ---

# Sets SELECTED_ITEMS global array with user selections
# Args: prompt, items...
# Returns 0 on success, 1 if no items provided
select_items() {
    local prompt="$1"
    shift
    local -a items=("$@")
    local count=${#items[@]}

    SELECTED_ITEMS=()

    if [[ $count -eq 0 ]]; then
        return 1
    fi

    echo "  ${BOLD}0)${NC} ${CYAN}All${NC}"
    for i in {1..$count}; do
        echo "  ${BOLD}$i)${NC} ${items[$i]}"
    done

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

    return 0
}

# --- Build and install functions ---

# Display error output in a bordered block
show_error_block() {
    local title="$1"
    local output="$2"
    echo ""
    echo "  ${RED}┌─ ${title} ─────────────────────────────────${NC}"
    echo "$output" | while IFS= read -r line; do
        echo "  ${RED}│${NC} $line"
    done
    echo "  ${RED}└────────────────────────────────────────────${NC}"
}

build_plugin() {
    local plugin_dir="$1"
    local plugin_name=$(basename "$plugin_dir")
    local output

    echo -n "Building ${BOLD}$plugin_name${NC}... "

    if [[ ! -f "$plugin_dir/package.json" ]]; then
        print_error "No package.json found"
        return 1
    fi

    if [[ ! -d "$plugin_dir/node_modules" ]]; then
        output=$( (cd "$plugin_dir" && npm install 2>&1) ) || {
            print_error "npm install failed"
            show_error_block "npm install" "$output"
            return 1
        }
    fi

    output=$( (cd "$plugin_dir" && npm run build 2>&1) ) || {
        print_error "Build failed"
        show_error_block "npm run build" "$output"
        return 1
    }

    print_success "Done"
}

install_plugin() {
    local plugin_dir="$1"
    local vault_dir="$2"
    local plugin_name=$(basename "$plugin_dir")
    local target_dir="$vault_dir/.obsidian/plugins/$plugin_name"

    mkdir -p "$target_dir"

    local files_copied=0
    for file in main.js manifest.json styles.css; do
        if [[ -f "$plugin_dir/$file" ]]; then
            cp "$plugin_dir/$file" "$target_dir/"
            ((files_copied++)) || true
        fi
    done

    if [[ $files_copied -eq 0 ]]; then
        print_error "No files to install (missing main.js?)"
        return 1
    fi

    local display_path="${target_dir/#$HOME/~}"
    print_success "$display_path"
}

# --- Main ---

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -a|--all)
                USE_ALL_PLUGINS=true
                shift
                ;;
            -p|--previous)
                USE_PREVIOUS_VAULTS=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    echo "${BOLD}${BLUE}Obsidian Plugin Installer${NC}"

    # Find plugins
    print_header "Discovering plugins..."
    local -a plugin_dirs
    while IFS= read -r line; do
        [[ -n "$line" ]] && plugin_dirs+=("$line")
    done < <(find_plugins)

    if [[ ${#plugin_dirs[@]} -eq 0 ]]; then
        print_error "No plugins found (looking for directories with manifest.json)"
        exit 1
    fi

    local -a plugin_names
    for dir in "${plugin_dirs[@]}"; do
        plugin_names+=("$(get_plugin_info "$dir")")
    done

    local -a plugins_to_install

    if [[ "$USE_ALL_PLUGINS" == "true" ]]; then
        print_header "Installing all ${#plugin_dirs[@]} plugins:"
        plugins_to_install=("${plugin_dirs[@]}")
        for name in "${plugin_names[@]}"; do
            echo "  ${CYAN}•${NC} $name"
        done
    else
        print_header "Found ${#plugin_dirs[@]} plugins:"
        select_items "Select plugins to install" "${plugin_names[@]}"
        local -a selected_plugins=("${SELECTED_ITEMS[@]}")

        if [[ ${#selected_plugins[@]} -eq 0 ]]; then
            print_warn "No plugins selected"
            exit 0
        fi

        # Map selected names back to directories
        for selected in "${selected_plugins[@]}"; do
            for i in {1..${#plugin_names[@]}}; do
                if [[ "${plugin_names[$i]}" == "$selected" ]]; then
                    plugins_to_install+=("${plugin_dirs[$i]}")
                    break
                fi
            done
        done
    fi

    # Build selected plugins
    print_header "Building..."
    for plugin_dir in "${plugins_to_install[@]}"; do
        build_plugin "$plugin_dir" || exit 1
    done

    # Handle vaults
    local -a vaults_to_install

    if [[ "$USE_PREVIOUS_VAULTS" == "true" ]]; then
        # Use cached vaults from --previous flag
        while IFS= read -r line; do
            [[ -n "$line" ]] && vaults_to_install+=("$line")
        done < <(load_cached_vaults 2>/dev/null)

        if [[ ${#vaults_to_install[@]} -eq 0 ]]; then
            print_error "No cached vaults found. Run without --previous first."
            exit 1
        fi

        print_header "Using ${#vaults_to_install[@]} cached vaults:"
        for vault in "${vaults_to_install[@]}"; do
            echo "  ${vault/#$HOME/~}"
        done
    else
        # Discover and prompt for vaults
        print_header "Discovering Obsidian vaults..."
        local -a vault_dirs
        while IFS= read -r line; do
            [[ -n "$line" ]] && vault_dirs+=("$line")
        done < <(find_vaults)

        if [[ ${#vault_dirs[@]} -eq 0 ]]; then
            print_error "No Obsidian vaults found"
            print_warn "Searched: ~/Documents, ~/Desktop, ~ (depth 5), iCloud"
            exit 1
        fi

        local -a vault_names
        for dir in "${vault_dirs[@]}"; do
            vault_names+=("${dir/#$HOME/~}")
        done

        print_header "Found ${#vault_dirs[@]} vaults:"
        select_items "Select vaults" "${vault_names[@]}"

        # Map selected names back to full paths
        for selected in "${SELECTED_ITEMS[@]}"; do
            for i in {1..${#vault_names[@]}}; do
                if [[ "${vault_names[$i]}" == "$selected" ]]; then
                    vaults_to_install+=("${vault_dirs[$i]}")
                    break
                fi
            done
        done

        # Save selection for next time
        [[ ${#vaults_to_install[@]} -gt 0 ]] && save_vaults_to_cache "${vaults_to_install[@]}"
    fi

    if [[ ${#vaults_to_install[@]} -eq 0 ]]; then
        print_warn "No vaults selected"
        exit 0
    fi

    # Install
    print_header "Installing..."
    for plugin_dir in "${plugins_to_install[@]}"; do
        local plugin_name=$(basename "$plugin_dir")
        echo "${BOLD}$plugin_name${NC} →"
        for vault_dir in "${vaults_to_install[@]}"; do
            echo -n "  "
            install_plugin "$plugin_dir" "$vault_dir"
        done
    done

    echo ""
    print_success "${BOLD}Done.${NC} Reload Obsidian to activate changes."
}

main "$@"
