#!/usr/bin/env bash
# setup.sh — Builds the sample-repo test fixture deterministically.
# Run from any directory; the fixture is always created relative to this script.
#
# The generated tests/fixtures/sample-repo/ directory is intentionally NOT
# committed to the repository (it is listed in the root .gitignore). Run this
# script before executing scanner tests.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR/sample-repo"

# ── Wipe any previous run ────────────────────────────────────────────────────
rm -rf "$REPO_DIR"
mkdir -p "$REPO_DIR"

# ── Git identity used for all commits (not a real person) ────────────────────
export GIT_AUTHOR_NAME="Test Fixture Bot"
export GIT_AUTHOR_EMAIL="fixture-bot@codecity.test"
export GIT_COMMITTER_NAME="Test Fixture Bot"
export GIT_COMMITTER_EMAIL="fixture-bot@codecity.test"

# ── Initialise repo ──────────────────────────────────────────────────────────
git -C "$REPO_DIR" init -q
git -C "$REPO_DIR" checkout -q -b main

# ── Helper: write a file, creating parent directories automatically ───────────
write_file() {
  local path="$REPO_DIR/$1"
  mkdir -p "$(dirname "$path")"
  cat > "$path"
}

# ════════════════════════════════════════════════════════════════════════════
# COMMIT 1 — Initial project scaffolding (package.json, .gitignore, docs)
# ════════════════════════════════════════════════════════════════════════════

# .gitignore (3 lines)
write_file ".gitignore" <<'EOF'
node_modules/
dist/
*.log
EOF

# package.json (10 lines, ~200 B)
write_file "package.json" <<'EOF'
{
  "name": "sample-repo",
  "version": "1.0.0",
  "description": "Sample repository used as a test fixture.",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "devDependencies": {}
}
EOF

# docs/README.md (15 lines, ~300 B)
write_file "docs/README.md" <<'EOF'
# Sample Repo

A minimal TypeScript project used as a deterministic test fixture for CodeCity.

## Structure

- `src/` — Application source code
- `tests/` — Jest unit tests
- `docs/` — Project documentation

## Getting Started

```
npm install && npm run build
```
EOF

# Commit 1 at a fixed past date
GIT_AUTHOR_DATE="2024-01-10T09:00:00+00:00" \
GIT_COMMITTER_DATE="2024-01-10T09:00:00+00:00" \
  git -C "$REPO_DIR" add .gitignore package.json docs/
GIT_AUTHOR_DATE="2024-01-10T09:00:00+00:00" \
GIT_COMMITTER_DATE="2024-01-10T09:00:00+00:00" \
  git -C "$REPO_DIR" commit -q -m "chore: initial project scaffolding"

# ════════════════════════════════════════════════════════════════════════════
# COMMIT 2 — Add source files, tests, and binary asset
# ════════════════════════════════════════════════════════════════════════════

# src/utils.ts (20 lines, ~400 B)
write_file "src/utils.ts" <<'EOF'
/**
 * Utility helpers shared across the application.
 */

/**
 * Clamps a number between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Returns true when the given string is non-empty after trimming whitespace.
 */
export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

EOF

# src/components/Button.tsx (30 lines, ~700 B)
write_file "src/components/Button.tsx" <<'EOF'
import React from "react";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps {
  label: string;
  variant?: Variant;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * A reusable button component with optional variant styling.
 */
const Button: React.FC<ButtonProps> = ({
  label,
  variant = "primary",
  disabled = false,
  onClick,
}) => {
  const cls = `btn btn--${variant}${disabled ? " btn--disabled" : ""}`;

  return (
    <button className={cls} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
};

export default Button;
EOF

# src/components/Header.tsx (80 lines, ~2 KB)
write_file "src/components/Header.tsx" <<'EOF'
import React, { useState } from "react";
import Button from "./Button";

interface NavItem {
  label: string;
  href: string;
}

interface HeaderProps {
  title: string;
  navItems?: NavItem[];
  onLoginClick?: () => void;
  onLogoutClick?: () => void;
  isLoggedIn?: boolean;
}

/**
 * Site-wide header component containing a title, navigation links,
 * and an optional auth button.
 */
const Header: React.FC<HeaderProps> = ({
  title,
  navItems = [],
  onLoginClick,
  onLogoutClick,
  isLoggedIn = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen((prev) => !prev);
  };

  const handleAuthClick = () => {
    if (isLoggedIn) {
      onLogoutClick?.();
    } else {
      onLoginClick?.();
    }
  };

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__title">{title}</span>
      </div>

      <button
        className="header__menu-toggle"
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        onClick={toggleMenu}
      >
        &#9776;
      </button>

      <nav className={`header__nav ${menuOpen ? "header__nav--open" : ""}`}>
        <ul className="header__nav-list">
          {navItems.map((item) => (
            <li key={item.href} className="header__nav-item">
              <a href={item.href} className="header__nav-link">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="header__actions">
        <Button
          label={isLoggedIn ? "Log out" : "Log in"}
          variant={isLoggedIn ? "secondary" : "primary"}
          onClick={handleAuthClick}
        />
      </div>
    </header>
  );
};

export default Header;
EOF

# src/index.ts (50 lines, ~1.2 KB)
write_file "src/index.ts" <<'EOF'
/**
 * Application entry point.
 *
 * Bootstraps the React application and mounts it onto the DOM. Also wires up
 * top-level error handling and exposes a minimal public API for the host page.
 */

import React from "react";
import ReactDOM from "react-dom/client";

import Header from "./components/Header";
import { clamp, isNonEmpty } from "./utils";

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/**
 * Mounts the application inside the element with the given id.
 * Throws if the element cannot be found.
 */
function mount(rootId: string): void {
  const container = document.getElementById(rootId);
  if (!container) {
    throw new Error(`Root element #${rootId} not found in the document.`);
  }
  const root = ReactDOM.createRoot(container);
  root.render(
    React.createElement(Header, {
      title: "CodeCity",
      navItems: NAV_ITEMS,
      isLoggedIn: false,
    })
  );
}

// Reads a numeric config value from a data attribute, clamped to range.
function readConfig(attr: string, min: number, max: number): number {
  const raw = document.documentElement.dataset[attr] ?? String(min);
  const parsed = parseInt(raw, 10);
  return clamp(Number.isFinite(parsed) ? parsed : min, min, max);
}

// Guard against server-side rendering environments.
if (typeof window !== "undefined" && isNonEmpty(document.readyState)) {
  mount("app");
}
export { mount, readConfig };
EOF

# tests/index.test.ts (40 lines, ~900 B)
write_file "tests/index.test.ts" <<'EOF'
/**
 * Unit tests for the top-level application entry point utilities.
 */

import { clamp, isNonEmpty } from "../src/utils";

// ── clamp ────────────────────────────────────────────────────────────────────

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when value is below range", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("returns max when value is above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles equal min and max", () => {
    expect(clamp(7, 4, 4)).toBe(4);
  });
});

describe("isNonEmpty", () => {

  it("returns true for a non-empty string", () => {
    expect(isNonEmpty("hello")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isNonEmpty("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    expect(isNonEmpty("   ")).toBe(false);
  });
});
EOF


# logo.png — minimal valid 1×1 red pixel PNG (binary, ~67 bytes)
# The PNG bytes are embedded as a hex string and written with printf/xxd.
# This is a complete, standards-conformant PNG file.
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' \
  > "$REPO_DIR/logo.png"

# Commit 2 at a later fixed date
GIT_AUTHOR_DATE="2024-03-22T14:30:00+00:00" \
GIT_COMMITTER_DATE="2024-03-22T14:30:00+00:00" \
  git -C "$REPO_DIR" add src/ tests/ logo.png
GIT_AUTHOR_DATE="2024-03-22T14:30:00+00:00" \
GIT_COMMITTER_DATE="2024-03-22T14:30:00+00:00" \
  git -C "$REPO_DIR" commit -q -m "feat: add source files, tests, and logo"

# ── Summary ──────────────────────────────────────────────────────────────────
echo "sample-repo created at: $REPO_DIR"
echo ""
git -C "$REPO_DIR" log --oneline
echo ""
echo "File inventory:"
find "$REPO_DIR" -not -path '*/.git/*' -type f | sort | while read -r f; do
  lines=$(wc -l < "$f" 2>/dev/null || echo "binary")
  size=$(wc -c < "$f")
  printf "  %-55s %4s lines  %5s bytes\n" "${f#$REPO_DIR/}" "$lines" "$size"
done
