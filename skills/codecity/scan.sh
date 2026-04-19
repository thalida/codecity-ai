#!/usr/bin/env bash
# scan.sh — CodeCity AI filesystem scanner
#
# Walks a directory tree, collects file/directory metadata and git history,
# and outputs a nested JSON manifest.
#
# Usage:
#   scan.sh --root <path> [--depth <n>] [--no-gitignore]
#           [--include <pattern>] [--exclude <pattern>] [--output <path>]

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ROOT=""
DEPTH=""
USE_GITIGNORE=true
INCLUDE_PATTERN=""
EXCLUDE_PATTERN=""
OUTPUT_PATH=""

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)      ROOT="$2";            shift 2 ;;
    --depth)     DEPTH="$2";           shift 2 ;;
    --gitignore) USE_GITIGNORE=true;   shift   ;;
    --no-gitignore) USE_GITIGNORE=false; shift ;;
    --include)   INCLUDE_PATTERN="$2"; shift 2 ;;
    --exclude)   EXCLUDE_PATTERN="$2"; shift 2 ;;
    --output)    OUTPUT_PATH="$2";     shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$ROOT" ]]; then
  echo "Error: --root is required" >&2
  exit 1
fi

ROOT="$(cd "$ROOT" && pwd)"

# ── OS detection ──────────────────────────────────────────────────────────────
OS="$(uname -s)"

# ── Helper: epoch to ISO-8601 UTC ─────────────────────────────────────────────
epoch_to_iso() {
  local epoch="$1"
  if [[ "$OS" == "Darwin" ]]; then
    date -r "$epoch" -u +"%Y-%m-%dT%H:%M:%SZ"
  else
    date -u -d "@$epoch" +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

# ── Helper: get file stat info ────────────────────────────────────────────────
# Outputs: <size> <birthtime_epoch> <mtime_epoch>
get_stat() {
  local filepath="$1"
  if [[ "$OS" == "Darwin" ]]; then
    stat -f "%z %B %m" "$filepath"
  else
    # Linux: no birthtime, use ctime for created
    local size mtime ctime
    size=$(stat -c "%s" "$filepath")
    mtime=$(stat -c "%Y" "$filepath")
    ctime=$(stat -c "%Z" "$filepath")
    echo "$size $ctime $mtime"
  fi
}

# ── Helper: detect binary ─────────────────────────────────────────────────────
is_binary() {
  local filepath="$1"
  local mime
  mime=$(file --mime-type -b "$filepath" 2>/dev/null || echo "application/octet-stream")
  case "$mime" in
    text/*|application/json|application/javascript|application/xml|\
    application/x-sh|application/x-shellscript|application/x-yaml|\
    application/x-ruby|application/x-perl|application/x-python|\
    application/xhtml+xml|application/x-httpd-php)
      echo "false"
      ;;
    *)
      echo "true"
      ;;
  esac
}

# ── Check if this is a git repo ───────────────────────────────────────────────
IS_GIT_REPO=false
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  IS_GIT_REPO=true
fi

# ── Collect git metadata in batch ────────────────────────────────────────────
# Maps: file_path -> created_date, modified_date, commit_count, contributors
declare -A GIT_CREATED
declare -A GIT_MODIFIED
declare -A GIT_COMMITS
declare -A GIT_CONTRIBUTORS

if [[ "$IS_GIT_REPO" == "true" ]]; then
  # Get created date for each file (first commit that added it).
  # Format: "COMMIT:<hash> <date>" marks a commit header; other non-empty lines are file paths.
  # We walk in reverse-chronological order, so last write per file wins = earliest commit.
  current_date=""
  while IFS= read -r line; do
    if [[ "$line" == COMMIT:* ]]; then
      # Extract date from "COMMIT:<hash> <date>"
      local_info="${line#COMMIT:}"
      current_date="${local_info#* }"
    elif [[ -n "$line" ]]; then
      # Non-empty, non-header line = file path
      # Always overwrite so we keep the earliest (oldest) commit date
      GIT_CREATED["$line"]="$current_date"
    fi
  done < <(git -C "$ROOT" log --format="COMMIT:%H %aI" --name-only --diff-filter=A 2>/dev/null)

  # Get contributor list per file.
  # Format: "COMMIT:<author>" marks a commit; other non-empty lines are file paths.
  declare -A _file_contributors
  current_author=""
  while IFS= read -r line; do
    if [[ "$line" == COMMIT:* ]]; then
      current_author="${line#COMMIT:}"
    elif [[ -n "$line" ]]; then
      # Non-empty, non-header line = file path
      local_key="$line"
      if [[ -n "${_file_contributors[$local_key]+x}" ]]; then
        if [[ "${_file_contributors[$local_key]}" != *"|${current_author}|"* ]]; then
          _file_contributors["$local_key"]="${_file_contributors[$local_key]}|${current_author}|"
        fi
      else
        _file_contributors["$local_key"]="|${current_author}|"
      fi
    fi
  done < <(git -C "$ROOT" log --format="COMMIT:%aN" --name-only 2>/dev/null)

  # Build GIT_CONTRIBUTORS as JSON arrays
  for fpath in "${!_file_contributors[@]}"; do
    contrib_str="${_file_contributors[$fpath]}"
    # Convert |name1||name2| -> JSON array
    json_arr=$(printf '%s' "$contrib_str" | tr '|' '\n' | grep -v '^$' | sort -u | jq -R . | jq -sc .)
    GIT_CONTRIBUTORS["$fpath"]="$json_arr"
  done

  # Get last modified date and commit count per file (iterate tracked files)
  while IFS= read -r fpath; do
    GIT_MODIFIED["$fpath"]=$(git -C "$ROOT" log -1 --format="%aI" -- "$fpath" 2>/dev/null || echo "")
    GIT_COMMITS["$fpath"]=$(git -C "$ROOT" rev-list --count HEAD -- "$fpath" 2>/dev/null || echo "0")
  done < <(git -C "$ROOT" ls-files 2>/dev/null)
fi

# ── Build list of files to include ───────────────────────────────────────────
# We use find to get all files, then optionally filter via git ls-files

build_find_args() {
  local find_args=("$ROOT")
  if [[ -n "$DEPTH" ]]; then
    find_args+=(-maxdepth "$DEPTH")
  fi
  find_args+=(-not -path "*/.git/*" -not -name ".git")
  echo "${find_args[@]}"
}

# Get tracked files set (for gitignore filtering)
declare -A TRACKED_FILES
if [[ "$IS_GIT_REPO" == "true" && "$USE_GITIGNORE" == "true" ]]; then
  # Get all tracked file relative paths + tracked directories we can infer
  while IFS= read -r fpath; do
    TRACKED_FILES["$fpath"]=1
    # Also mark parent dirs as visible
    dir="$(dirname "$fpath")"
    while [[ "$dir" != "." && "$dir" != "/" ]]; do
      TRACKED_FILES["$dir"]=1
      dir="$(dirname "$dir")"
    done
  done < <(git -C "$ROOT" ls-files 2>/dev/null)
fi

# ── Core: build JSON for a single file ───────────────────────────────────────
file_json() {
  local abs_path="$1"
  local rel_path="$2"
  local name
  name="$(basename "$abs_path")"
  local extension=""
  if [[ "$name" == *.* && "$name" != .* ]]; then
    extension=".${name##*.}"
  elif [[ "$name" == .*.* ]]; then
    extension=".${name##*.}"
  fi

  local stat_out
  stat_out=$(get_stat "$abs_path")
  local size birthtime_epoch mtime_epoch
  size=$(echo "$stat_out" | awk '{print $1}')
  birthtime_epoch=$(echo "$stat_out" | awk '{print $2}')
  mtime_epoch=$(echo "$stat_out" | awk '{print $3}')

  local created modified
  created=$(epoch_to_iso "$birthtime_epoch")
  modified=$(epoch_to_iso "$mtime_epoch")

  local lines
  lines=$(wc -l < "$abs_path" 2>/dev/null | tr -d ' ' || echo "0")

  local binary
  binary=$(is_binary "$abs_path")

  # Git metadata
  local git_json="null"
  if [[ "$IS_GIT_REPO" == "true" ]]; then
    local g_created g_modified g_commits g_contributors
    g_created="${GIT_CREATED[$rel_path]:-}"
    g_modified="${GIT_MODIFIED[$rel_path]:-}"
    g_commits="${GIT_COMMITS[$rel_path]:-0}"
    g_contributors="${GIT_CONTRIBUTORS[$rel_path]:-[]}"

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

# ── Core: recursively build directory tree ────────────────────────────────────
# Returns a JSON object for a directory node
build_tree() {
  local abs_dir="$1"
  local rel_dir="$2"   # relative to ROOT; "." for root
  local current_depth="${3:-0}"

  local name
  if [[ "$rel_dir" == "." ]]; then
    name="$(basename "$abs_dir")"
  else
    name="$(basename "$abs_dir")"
  fi

  # Collect children (immediate entries only)
  local children_json="[]"
  local children_count=0
  local children_file_count=0
  local children_dir_count=0
  local descendants_count=0
  local descendants_file_count=0
  local descendants_dir_count=0
  local descendants_size=0

  # Temporary arrays for building children
  local file_entries=()
  local dir_entries=()

  # Read directory entries
  while IFS= read -r -d '' entry; do
    local entry_name
    entry_name="$(basename "$entry")"

    # Skip .git
    [[ "$entry_name" == ".git" ]] && continue

    # Compute relative path
    local entry_rel
    if [[ "$rel_dir" == "." ]]; then
      entry_rel="$entry_name"
    else
      entry_rel="$rel_dir/$entry_name"
    fi

    # Gitignore filtering
    if [[ "$IS_GIT_REPO" == "true" && "$USE_GITIGNORE" == "true" ]]; then
      if [[ -z "${TRACKED_FILES[$entry_rel]+x}" ]]; then
        continue
      fi
    fi

    if [[ -f "$entry" ]]; then
      # Apply include/exclude patterns
      if [[ -n "$INCLUDE_PATTERN" ]]; then
        [[ "$entry_name" == $INCLUDE_PATTERN ]] || continue
      fi
      if [[ -n "$EXCLUDE_PATTERN" ]]; then
        [[ "$entry_name" == $EXCLUDE_PATTERN ]] && continue
      fi
      file_entries+=("$entry")
    elif [[ -d "$entry" ]]; then
      dir_entries+=("$entry")
    fi
  done < <(find "$abs_dir" -maxdepth 1 -mindepth 1 -print0 | sort -z)

  # Process files
  local file_jsons=()
  for fentry in "${file_entries[@]+"${file_entries[@]}"}"; do
    local frel
    frel="${fentry#$ROOT/}"
    local fjson
    fjson=$(file_json "$fentry" "$frel")
    file_jsons+=("$fjson")
    children_count=$((children_count + 1))
    children_file_count=$((children_file_count + 1))
    descendants_count=$((descendants_count + 1))
    descendants_file_count=$((descendants_file_count + 1))
    # Add size to descendants_size
    local fsize
    fsize=$(echo "$fjson" | jq '.size')
    descendants_size=$((descendants_size + fsize))
  done

  # Process directories
  local dir_jsons=()
  for dentry in "${dir_entries[@]+"${dir_entries[@]}"}"; do
    local drel
    drel="${dentry#$ROOT/}"

    # Check depth limit
    if [[ -n "$DEPTH" && $((current_depth + 1)) -ge $DEPTH ]]; then
      # Include directory but without recursing into children
      local dname
      dname="$(basename "$dentry")"
      local djson
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
      local djson
      djson=$(build_tree "$dentry" "$drel" $((current_depth + 1)))
      dir_jsons+=("$djson")
      children_count=$((children_count + 1))
      children_dir_count=$((children_dir_count + 1))

      # Accumulate descendants from child dir
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

  # Build children array: files first, then dirs (alphabetical within each group)
  local all_children_json="[]"
  if [[ ${#file_jsons[@]} -gt 0 || ${#dir_jsons[@]} -gt 0 ]]; then
    # Combine files and dirs into one JSON array
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

# ── Main ──────────────────────────────────────────────────────────────────────
SCANNED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

TREE=$(build_tree "$ROOT" "." 0)

RESULT=$(jq -n \
  --arg root "$ROOT" \
  --arg scanned_at "$SCANNED_AT" \
  --argjson depth "${DEPTH:-null}" \
  --argjson tree "$TREE" \
  '{
    root: $root,
    scanned_at: $scanned_at,
    depth: $depth,
    tree: $tree
  }')

if [[ -n "$OUTPUT_PATH" ]]; then
  echo "$RESULT" > "$OUTPUT_PATH"
else
  echo "$RESULT"
fi
