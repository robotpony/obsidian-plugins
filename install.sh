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
        "$HOME/projects:5"
        "$HOME/writing:4"
        "$HOME:2"
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
# Args: prompt, has_cached ("true"/"false"), has_select_all ("true"/"false"), items...
# Returns 0 on success, 1 if no items provided
# Sets SELECTED_ITEMS=("CACHED") if user chose cached option
select_items() {
    local prompt="$1"
    local has_cached="$2"
    local has_select_all="$3"
    shift 3
    local -a items=("$@")
    local count=${#items[@]}

    SELECTED_ITEMS=()

    if [[ $count -eq 0 ]]; then
        return 1
    fi

    # Show option 0 for cached or select-all
    if [[ "$has_cached" == "true" ]]; then
        echo "  ${BOLD}0)${NC} ${CYAN}Use previous selection${NC}"
    elif [[ "$has_select_all" == "true" ]]; then
        echo "  ${BOLD}0)${NC} ${CYAN}All${NC}"
    fi

    for i in {1..$count}; do
        echo "  ${BOLD}$i)${NC} ${items[$i]}"
    done

    echo ""
    local hint="space-separated numbers"
    if [[ "$has_cached" == "true" ]]; then
        hint="0 for previous, or $hint"
    elif [[ "$has_select_all" == "true" ]]; then
        hint="0 for all, or $hint"
    fi
    echo -n "$prompt ($hint, or ${BOLD}all${NC}): "
    read -r selection </dev/tty

    # Handle option 0
    if [[ "$selection" == "0" ]]; then
        if [[ "$has_cached" == "true" ]]; then
            SELECTED_ITEMS=("CACHED")
        else
            SELECTED_ITEMS=("${items[@]}")
        fi
        return 0
    fi

    if [[ "$selection" == "all" ]]; then
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

build_plugin() {
    local plugin_dir="$1"
    local plugin_name=$(basename "$plugin_dir")

    echo -n "Building ${BOLD}$plugin_name${NC}... "

    if [[ ! -f "$plugin_dir/package.json" ]]; then
        print_error "No package.json found"
        return 1
    fi

    if [[ ! -d "$plugin_dir/node_modules" ]]; then
        (cd "$plugin_dir" && npm install --silent 2>/dev/null) || {
            print_error "npm install failed"
            return 1
        }
    fi

    (cd "$plugin_dir" && npm run build --silent 2>/dev/null) || {
        print_error "Build failed"
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

    print_header "Found ${#plugin_dirs[@]} plugins:"
    select_items "Select plugins to install" "false" "true" "${plugin_names[@]}"
    local -a selected_plugins=("${SELECTED_ITEMS[@]}")

    if [[ ${#selected_plugins[@]} -eq 0 ]]; then
        print_warn "No plugins selected"
        exit 0
    fi

    # Map selected names back to directories
    local -a plugins_to_install
    for selected in "${selected_plugins[@]}"; do
        for i in {1..${#plugin_names[@]}}; do
            if [[ "${plugin_names[$i]}" == "$selected" ]]; then
                plugins_to_install+=("${plugin_dirs[$i]}")
                break
            fi
        done
    done

    # Build selected plugins
    print_header "Building..."
    for plugin_dir in "${plugins_to_install[@]}"; do
        build_plugin "$plugin_dir" || exit 1
    done

    # Check for cached vaults
    local -a cached_vaults
    local has_cached="false"
    while IFS= read -r line; do
        [[ -n "$line" ]] && cached_vaults+=("$line")
    done < <(load_cached_vaults 2>/dev/null)
    [[ ${#cached_vaults[@]} -gt 0 ]] && has_cached="true"

    # Find vaults
    print_header "Discovering Obsidian vaults..."
    local -a vault_dirs
    while IFS= read -r line; do
        [[ -n "$line" ]] && vault_dirs+=("$line")
    done < <(find_vaults)

    if [[ ${#vault_dirs[@]} -eq 0 ]]; then
        print_error "No Obsidian vaults found"
        print_warn "Searched: ~/Documents, ~/Desktop, ~/projects, ~/writing, ~, iCloud"
        exit 1
    fi

    local -a vault_names
    for dir in "${vault_dirs[@]}"; do
        vault_names+=("${dir/#$HOME/~}")
    done

    print_header "Found ${#vault_dirs[@]} vaults:"
    select_items "Select vaults" "$has_cached" "true" "${vault_names[@]}"

    local -a vaults_to_install
    if [[ "${SELECTED_ITEMS[1]}" == "CACHED" ]]; then
        vaults_to_install=("${cached_vaults[@]}")
        echo "  Using ${#cached_vaults[@]} previously selected vaults"
    else
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
