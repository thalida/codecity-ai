# scan.sh — CodeCity scanner (bash library, must be sourced).
#
# Walks a directory tree, collects file/directory metadata + git history, and
# prints a nested JSON manifest to stdout. Designed for `source`, not exec.
#
# Inputs (bash vars the caller must set before calling scan_tree):
#   ROOT       — required, absolute or relative path
#   DEPTH      — optional max depth (empty = unlimited)
#   INCLUDE    — optional glob (matched against filenames)
#   EXCLUDE    — optional glob (matched against filenames)
#   GITIGNORE  — "1" (default) to respect .gitignore, "0" to include everything
#
# Output: manifest JSON on stdout.
#
# Depends on: bash 4+, jq, git, find, stat, wc, file.

# ── Module-level state (re-initialized by scan_tree on each call) ─────────────
declare -A _SCAN_GIT_CREATED
declare -A _SCAN_GIT_MODIFIED
declare -A _SCAN_GIT_COMMITS
declare -A _SCAN_GIT_CONTRIBUTORS
declare -A _SCAN_TRACKED_FILES
_SCAN_FILES_SEEN=0

# Progress logger. Writes to stderr so stdout stays JSON-clean.
# Silenced by CODECITY_QUIET=1 (tests set this).
_scan_log() { [[ "${CODECITY_QUIET:-0}" == "1" ]] || printf '[scan] %s\n' "$*" >&2; }

# ── Helpers ───────────────────────────────────────────────────────────────────
_scan_epoch_to_iso() {
  local epoch="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    date -r "$epoch" -u +"%Y-%m-%dT%H:%M:%SZ"
  else
    date -u -d "@$epoch" +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

_scan_get_stat() {
  local filepath="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f "%z %B %m" "$filepath"
  else
    local size mtime ctime
    size=$(stat -c "%s" "$filepath")
    mtime=$(stat -c "%Y" "$filepath")
    ctime=$(stat -c "%Z" "$filepath")
    echo "$size $ctime $mtime"
  fi
}

_scan_is_binary() {
  local mime
  mime=$(file --mime-type -b "$1" 2>/dev/null || echo "application/octet-stream")
  case "$mime" in
    text/*|application/json|application/javascript|application/xml|\
    application/x-sh|application/x-shellscript|application/x-yaml|\
    application/x-ruby|application/x-perl|application/x-python|\
    application/xhtml+xml|application/x-httpd-php)
      echo "false" ;;
    *)
      echo "true" ;;
  esac
}

_scan_file_json() {
  local abs_path="$1"
  local rel_path="$2"
  local name extension stat_out size birthtime_epoch mtime_epoch
  local created modified lines binary git_json
  name="$(basename "$abs_path")"
  extension=""
  if [[ "$name" == *.* && "$name" != .* ]]; then
    extension=".${name##*.}"
  elif [[ "$name" == .*.* ]]; then
    extension=".${name##*.}"
  fi

  stat_out=$(_scan_get_stat "$abs_path")
  size=$(echo "$stat_out" | awk '{print $1}')
  birthtime_epoch=$(echo "$stat_out" | awk '{print $2}')
  mtime_epoch=$(echo "$stat_out" | awk '{print $3}')
  created=$(_scan_epoch_to_iso "$birthtime_epoch")
  modified=$(_scan_epoch_to_iso "$mtime_epoch")

  lines=$(wc -l < "$abs_path" 2>/dev/null | tr -d ' ' || echo "0")
  binary=$(_scan_is_binary "$abs_path")

  git_json="null"
  if [[ "$_SCAN_IS_GIT_REPO" == "true" ]]; then
    local g_created g_modified g_commits g_contributors
    g_created="${_SCAN_GIT_CREATED[$rel_path]:-}"
    g_modified="${_SCAN_GIT_MODIFIED[$rel_path]:-}"
    g_commits="${_SCAN_GIT_COMMITS[$rel_path]:-0}"
    g_contributors="${_SCAN_GIT_CONTRIBUTORS[$rel_path]:-[]}"

    git_json=$(jq -n \
      --arg created "$g_created" \
      --arg modified "$g_modified" \
      --argjson commits "$g_commits" \
      --argjson contributors "$g_contributors" \
      '{
        created: (if $created == "" then null else $created end),
        modified: (if $modified == "" then null else $modified end),
        commits: $commits,
        contributors: $contributors
      }')
  fi

  jq -n \
    --arg name "$name" \
    --arg path "$rel_path" \
    --arg fullPath "$abs_path" \
    --arg extension "$extension" \
    --argjson size "$size" \
    --argjson lines "$lines" \
    --arg binary "$binary" \
    --arg created "$created" \
    --arg modified "$modified" \
    --argjson git "$git_json" \
    '{
      name: $name,
      type: "file",
      path: $path,
      fullPath: $fullPath,
      extension: $extension,
      size: $size,
      lines: $lines,
      binary: ($binary == "true"),
      created: $created,
      modified: $modified,
      git: $git
    }'
}

_scan_build_tree() {
  local abs_dir="$1"
  local rel_dir="$2"
  local current_depth="${3:-0}"

  local name children_count=0 children_file_count=0 children_dir_count=0
  local descendants_count=0 descendants_file_count=0 descendants_dir_count=0
  local descendants_size=0
  name="$(basename "$abs_dir")"

  local file_entries=() dir_entries=()

  while IFS= read -r -d '' entry; do
    local entry_name entry_rel
    entry_name="$(basename "$entry")"
    [[ "$entry_name" == ".git" ]] && continue
    if [[ "$rel_dir" == "." ]]; then
      entry_rel="$entry_name"
    else
      entry_rel="$rel_dir/$entry_name"
    fi

    if [[ "$_SCAN_IS_GIT_REPO" == "true" && "$GITIGNORE" != "0" ]]; then
      [[ -n "${_SCAN_TRACKED_FILES[$entry_rel]+x}" ]] || continue
    fi

    if [[ -f "$entry" ]]; then
      if [[ -n "${INCLUDE:-}" ]]; then
        [[ "$entry_name" == $INCLUDE ]] || continue
      fi
      if [[ -n "${EXCLUDE:-}" ]]; then
        [[ "$entry_name" == $EXCLUDE ]] && continue
      fi
      file_entries+=("$entry")
    elif [[ -d "$entry" ]]; then
      dir_entries+=("$entry")
    fi
  done < <(find "$abs_dir" -maxdepth 1 -mindepth 1 -print0 | sort -z)

  local file_jsons=() dir_jsons=()

  for fentry in "${file_entries[@]+"${file_entries[@]}"}"; do
    local frel fjson fsize
    frel="${fentry#"$_SCAN_ROOT"/}"
    fjson=$(_scan_file_json "$fentry" "$frel")
    file_jsons+=("$fjson")
    children_count=$((children_count + 1))
    children_file_count=$((children_file_count + 1))
    descendants_count=$((descendants_count + 1))
    descendants_file_count=$((descendants_file_count + 1))
    fsize=$(echo "$fjson" | jq '.size')
    descendants_size=$((descendants_size + fsize))
    _SCAN_FILES_SEEN=$((_SCAN_FILES_SEEN + 1))
    # Heartbeat every 25 files so large repos show progress.
    if (( _SCAN_FILES_SEEN % 25 == 0 )); then
      _scan_log "  walked $_SCAN_FILES_SEEN files so far…"
    fi
  done

  for dentry in "${dir_entries[@]+"${dir_entries[@]}"}"; do
    local drel djson
    drel="${dentry#"$_SCAN_ROOT"/}"
    if [[ -n "${DEPTH:-}" && $((current_depth + 1)) -ge $DEPTH ]]; then
      local dname
      dname="$(basename "$dentry")"
      djson=$(jq -n \
        --arg name "$dname" \
        --arg path "$drel" \
        --arg fullPath "$dentry" \
        '{
          name: $name,
          type: "directory",
          path: $path,
          fullPath: $fullPath,
          children_count: 0,
          children_file_count: 0,
          children_dir_count: 0,
          descendants_count: 0,
          descendants_file_count: 0,
          descendants_dir_count: 0,
          descendants_size: 0,
          children: []
        }')
      dir_jsons+=("$djson")
      children_count=$((children_count + 1))
      children_dir_count=$((children_dir_count + 1))
      descendants_count=$((descendants_count + 1))
      descendants_dir_count=$((descendants_dir_count + 1))
    else
      djson=$(_scan_build_tree "$dentry" "$drel" $((current_depth + 1)))
      dir_jsons+=("$djson")
      children_count=$((children_count + 1))
      children_dir_count=$((children_dir_count + 1))

      local child_desc child_desc_f child_desc_d child_desc_s
      child_desc=$(echo "$djson" | jq '.descendants_count')
      child_desc_f=$(echo "$djson" | jq '.descendants_file_count')
      child_desc_d=$(echo "$djson" | jq '.descendants_dir_count')
      child_desc_s=$(echo "$djson" | jq '.descendants_size')
      descendants_count=$((descendants_count + 1 + child_desc))
      descendants_file_count=$((descendants_file_count + child_desc_f))
      descendants_dir_count=$((descendants_dir_count + 1 + child_desc_d))
      descendants_size=$((descendants_size + child_desc_s))
    fi
  done

  local all_children_json="[]"
  if [[ ${#file_jsons[@]} -gt 0 || ${#dir_jsons[@]} -gt 0 ]]; then
    local combined="[]"
    for fj in "${file_jsons[@]+"${file_jsons[@]}"}"; do
      combined=$(echo "$combined" | jq --argjson item "$fj" '. + [$item]')
    done
    for dj in "${dir_jsons[@]+"${dir_jsons[@]}"}"; do
      combined=$(echo "$combined" | jq --argjson item "$dj" '. + [$item]')
    done
    all_children_json="$combined"
  fi

  jq -n \
    --arg name "$name" \
    --arg path "$rel_dir" \
    --arg fullPath "$abs_dir" \
    --argjson children_count "$children_count" \
    --argjson children_file_count "$children_file_count" \
    --argjson children_dir_count "$children_dir_count" \
    --argjson descendants_count "$descendants_count" \
    --argjson descendants_file_count "$descendants_file_count" \
    --argjson descendants_dir_count "$descendants_dir_count" \
    --argjson descendants_size "$descendants_size" \
    --argjson children "$all_children_json" \
    '{
      name: $name,
      type: "directory",
      path: $path,
      fullPath: $fullPath,
      children_count: $children_count,
      children_file_count: $children_file_count,
      children_dir_count: $children_dir_count,
      descendants_count: $descendants_count,
      descendants_file_count: $descendants_file_count,
      descendants_dir_count: $descendants_dir_count,
      descendants_size: $descendants_size,
      children: $children
    }'
}

# ── Public entry ──────────────────────────────────────────────────────────────
scan_tree() {
  [[ -n "${ROOT:-}" ]] || { echo "scan_tree: ROOT is required" >&2; return 2; }
  _SCAN_ROOT="$(cd "$ROOT" && pwd)"
  _scan_log "resolving $_SCAN_ROOT"

  # Reset per-call state
  _SCAN_GIT_CREATED=()
  _SCAN_GIT_MODIFIED=()
  _SCAN_GIT_COMMITS=()
  _SCAN_GIT_CONTRIBUTORS=()
  _SCAN_TRACKED_FILES=()
  _SCAN_FILES_SEEN=0

  _SCAN_IS_GIT_REPO=false
  if git -C "$_SCAN_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    _SCAN_IS_GIT_REPO=true
  fi

  if [[ "$_SCAN_IS_GIT_REPO" == "true" ]]; then
    _scan_log "git repo detected — collecting commit metadata…"
    local current_date line info
    while IFS= read -r line; do
      if [[ "$line" == COMMIT:* ]]; then
        info="${line#COMMIT:}"
        current_date="${info#* }"
      elif [[ -n "$line" ]]; then
        _SCAN_GIT_CREATED["$line"]="$current_date"
      fi
    done < <(git -C "$_SCAN_ROOT" log --format="COMMIT:%H %aI" --name-only --diff-filter=A 2>/dev/null)

    _scan_log "  collected creation dates for ${#_SCAN_GIT_CREATED[@]} files"

    declare -A _file_contributors
    local current_author key contrib_str json_arr
    while IFS= read -r line; do
      if [[ "$line" == COMMIT:* ]]; then
        current_author="${line#COMMIT:}"
      elif [[ -n "$line" ]]; then
        key="$line"
        if [[ -n "${_file_contributors[$key]+x}" ]]; then
          if [[ "${_file_contributors[$key]}" != *"|${current_author}|"* ]]; then
            _file_contributors["$key"]="${_file_contributors[$key]}|${current_author}|"
          fi
        else
          _file_contributors["$key"]="|${current_author}|"
        fi
      fi
    done < <(git -C "$_SCAN_ROOT" log --format="COMMIT:%aN" --name-only 2>/dev/null)

    local fpath
    for fpath in "${!_file_contributors[@]}"; do
      contrib_str="${_file_contributors[$fpath]}"
      json_arr=$(printf '%s' "$contrib_str" | tr '|' '\n' | grep -v '^$' | sort -u | jq -R . | jq -sc .)
      _SCAN_GIT_CONTRIBUTORS["$fpath"]="$json_arr"
    done
    _scan_log "  collected contributors for ${#_SCAN_GIT_CONTRIBUTORS[@]} files"

    _scan_log "  collecting per-file modified date + commit count…"
    while IFS= read -r fpath; do
      _SCAN_GIT_MODIFIED["$fpath"]=$(git -C "$_SCAN_ROOT" log -1 --format="%aI" -- "$fpath" 2>/dev/null || echo "")
      _SCAN_GIT_COMMITS["$fpath"]=$(git -C "$_SCAN_ROOT" rev-list --count HEAD -- "$fpath" 2>/dev/null || echo "0")
    done < <(git -C "$_SCAN_ROOT" ls-files 2>/dev/null)

    if [[ "${GITIGNORE:-1}" != "0" ]]; then
      while IFS= read -r fpath; do
        _SCAN_TRACKED_FILES["$fpath"]=1
        local dir="$(dirname "$fpath")"
        while [[ "$dir" != "." && "$dir" != "/" ]]; do
          _SCAN_TRACKED_FILES["$dir"]=1
          dir="$(dirname "$dir")"
        done
      done < <(git -C "$_SCAN_ROOT" ls-files 2>/dev/null)
      _scan_log "  .gitignore filtering on — ${#_SCAN_TRACKED_FILES[@]} tracked entries"
    fi
  else
    _scan_log "not a git repo — filesystem dates only"
  fi

  local scanned_at tree
  scanned_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  _scan_log "walking tree (per-file git log + file_json; this is the slow phase)…"
  tree=$(_scan_build_tree "$_SCAN_ROOT" "." 0)
  # Note: _SCAN_FILES_SEEN increments inside a subshell so we can't report the
  # final total here. Heartbeats inside _scan_build_tree show progress for
  # large repos. codecity.sh reports the final count via jq.
  _scan_log "tree walked; emitting manifest JSON"

  jq -n \
    --arg root "$_SCAN_ROOT" \
    --arg scanned_at "$scanned_at" \
    --argjson depth "${DEPTH:-null}" \
    --argjson tree "$tree" \
    '{
      root: $root,
      scanned_at: $scanned_at,
      depth: $depth,
      tree: $tree
    }'
}
