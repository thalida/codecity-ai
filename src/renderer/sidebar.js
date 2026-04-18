// sidebar.js — CodeCity AI sidebar detail panel
//
// Handles creating and populating the right-side metadata panel that slides in
// when a user clicks a building (file) or street block (directory).
//
// All functions are globally available (no modules). Files are concatenated at build time.

// ── State ─────────────────────────────────────────────────────────────────────

// Track the currently selected building element so we can clear its highlight
var _selectedBuilding = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Show the sidebar populated with metadata for a file node.
 *
 * Expected file shape (from scan.sh manifest):
 *   name, path, fullPath, extension, size, lines, created, modified,
 *   git: { created, modified, commits, contributors } | null
 *
 * @param {Object} file - File node from the scanner manifest.
 */
function showFileSidebar(file) {
  var sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Clear previous content
  while (sidebar.firstChild) {
    sidebar.removeChild(sidebar.firstChild);
  }

  // ---- Header: name + extension badge ----------------------------------------
  var header = document.createElement('div');
  header.className = 'sidebar-header';

  var nameEl = document.createElement('h2');
  nameEl.className = 'sidebar-name';
  nameEl.textContent = file.name || '';
  header.appendChild(nameEl);

  if (file.extension) {
    var badge = document.createElement('span');
    badge.className = 'sidebar-badge';
    badge.textContent = file.extension;

    // Derive hue from the extension using the globally available getHue function
    // (colors.js is concatenated before this file). Fall back gracefully if absent.
    var hue = 220; // default blue
    if (typeof getHue === 'function' && typeof _palette !== 'undefined') {
      hue = getHue(file.extension, _palette);
    } else if (typeof getHue === 'function') {
      hue = getHue(file.extension, {});
    }
    badge.style.backgroundColor = 'hsl(' + hue + ', 60%, 40%)';
    badge.style.color = 'hsl(' + hue + ', 20%, 90%)';
    header.appendChild(badge);
  }

  sidebar.appendChild(header);

  // ---- Full path with copy button --------------------------------------------
  var pathRow = _makePathRow(file.path || file.fullPath || '');
  sidebar.appendChild(pathRow);

  // ---- Metadata rows ---------------------------------------------------------
  var meta = document.createElement('dl');
  meta.className = 'sidebar-meta';

  // Size
  _appendMetaRow(meta, 'Size', formatBytes(file.size || 0));

  // Line count
  _appendMetaRow(meta, 'Lines', String(file.lines != null ? file.lines : '—'));

  // Dates — prefer git dates; label accordingly
  var hasGit = file.git && (file.git.created || file.git.modified);

  var createdDate   = (file.git && file.git.created)  || file.created  || null;
  var modifiedDate  = (file.git && file.git.modified) || file.modified || null;
  var dateSource    = hasGit ? '(git)' : '(filesystem)';

  _appendMetaRow(meta, 'Created ' + dateSource,
    createdDate ? formatDate(createdDate) : '—');
  _appendMetaRow(meta, 'Modified ' + dateSource,
    modifiedDate ? formatDate(modifiedDate) : '—');

  // Git-only fields
  if (file.git) {
    if (file.git.commits != null) {
      _appendMetaRow(meta, 'Commits', String(file.git.commits));
    }

    if (file.git.contributors && file.git.contributors.length > 0) {
      _appendContributors(meta, file.git.contributors);
    }
  }

  sidebar.appendChild(meta);

  // ---- Slide in --------------------------------------------------------------
  sidebar.classList.add('open');
}

/**
 * Show the sidebar populated with metadata for a directory node.
 *
 * Expected directory shape (from scan.sh manifest):
 *   name, path, fullPath,
 *   children_count, children_file_count, children_dir_count,
 *   descendants_count, descendants_file_count, descendants_dir_count,
 *   descendants_size
 *
 * @param {Object} dir - Directory node from the scanner manifest.
 */
function showDirSidebar(dir) {
  var sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Clear previous content
  while (sidebar.firstChild) {
    sidebar.removeChild(sidebar.firstChild);
  }

  // ---- Header: name ----------------------------------------------------------
  var header = document.createElement('div');
  header.className = 'sidebar-header';

  var nameEl = document.createElement('h2');
  nameEl.className = 'sidebar-name';
  nameEl.textContent = dir.name || '';
  header.appendChild(nameEl);

  sidebar.appendChild(header);

  // ---- Full path with copy button --------------------------------------------
  var pathRow = _makePathRow(dir.path || dir.fullPath || '');
  sidebar.appendChild(pathRow);

  // ---- Metadata rows ---------------------------------------------------------
  var meta = document.createElement('dl');
  meta.className = 'sidebar-meta';

  // Children counts
  _appendMetaRow(meta, 'Children',
    _countSummary(dir.children_count, dir.children_file_count, dir.children_dir_count));

  // Descendants counts
  _appendMetaRow(meta, 'Descendants',
    _countSummary(dir.descendants_count, dir.descendants_file_count, dir.descendants_dir_count));

  // Total size of descendants
  _appendMetaRow(meta, 'Total Size', formatBytes(dir.descendants_size || 0));

  sidebar.appendChild(meta);

  // ---- Slide in --------------------------------------------------------------
  sidebar.classList.add('open');
}

/**
 * Close the sidebar and clear any selected building highlight.
 */
function closeSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.remove('open');
  }

  if (_selectedBuilding) {
    _selectedBuilding.classList.remove('selected');
    _selectedBuilding = null;
  }
}

/**
 * Copy text to the clipboard with a brief visual confirmation on the trigger button.
 *
 * Uses navigator.clipboard (modern) with fallback to the legacy execCommand API
 * for environments that don't support the Clipboard API (e.g. non-HTTPS, older browsers).
 *
 * @param {string} text    - The text to copy.
 * @param {Element} button - The button element that triggered the copy action.
 */
function copyToClipboard(text, button) {
  function showFeedback() {
    if (!button) return;
    var original = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(function () {
      button.textContent = original;
    }, 1500);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showFeedback, function () {
      _legacyCopy(text);
      showFeedback();
    });
  } else {
    _legacyCopy(text);
    showFeedback();
  }
}

/**
 * Format a byte count into a human-readable string.
 *
 * @param {number} bytes
 * @returns {string} e.g. "512 B", "3.4 KB", "1.2 MB"
 */
function formatBytes(bytes) {
  if (bytes < 1024) {
    return bytes + ' B';
  }
  if (bytes < 1048576) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/**
 * Format an ISO-8601 date string into a human-readable date.
 *
 * @param {string} isoString - e.g. "2026-04-18T10:30:00Z"
 * @returns {string} e.g. "Apr 18, 2026"
 */
function formatDate(isoString) {
  if (!isoString) return '—';
  var d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Build a path row element: the path text + a copy button.
 *
 * @param {string} pathText
 * @returns {Element}
 */
function _makePathRow(pathText) {
  var row = document.createElement('div');
  row.className = 'sidebar-path-row';

  var pathEl = document.createElement('span');
  pathEl.className = 'sidebar-path';
  pathEl.textContent = pathText;
  row.appendChild(pathEl);

  var copyBtn = document.createElement('button');
  copyBtn.className = 'sidebar-copy-btn';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', function () {
    copyToClipboard(pathText, copyBtn);
  });
  row.appendChild(copyBtn);

  return row;
}

/**
 * Append a label/value pair to a <dl> element.
 *
 * @param {Element} dl    - The <dl> container to append to.
 * @param {string}  label - The term text.
 * @param {string}  value - The definition text.
 */
function _appendMetaRow(dl, label, value) {
  var dt = document.createElement('dt');
  dt.textContent = label;
  dl.appendChild(dt);

  var dd = document.createElement('dd');
  dd.textContent = value;
  dl.appendChild(dd);
}

/**
 * Append a contributors term/definition pair to the <dl>.
 * Contributors are rendered as an inline list.
 *
 * @param {Element}  dl           - The <dl> container.
 * @param {string[]} contributors - Array of contributor name strings.
 */
function _appendContributors(dl, contributors) {
  var dt = document.createElement('dt');
  dt.textContent = 'Contributors';
  dl.appendChild(dt);

  var dd = document.createElement('dd');
  var list = document.createElement('ul');
  list.className = 'sidebar-contributors';

  for (var i = 0; i < contributors.length; i++) {
    var li = document.createElement('li');
    li.textContent = contributors[i];
    list.appendChild(li);
  }

  dd.appendChild(list);
  dl.appendChild(dd);
}

/**
 * Build a "total / X files / Y dirs" summary string for children/descendants.
 *
 * @param {number} total
 * @param {number} files
 * @param {number} dirs
 * @returns {string}
 */
function _countSummary(total, files, dirs) {
  return (total || 0) + ' total / ' + (files || 0) + ' files / ' + (dirs || 0) + ' dirs';
}

/**
 * Legacy clipboard copy using a temporary textarea and execCommand.
 * Used as a fallback when navigator.clipboard is unavailable.
 *
 * @param {string} text
 */
function _legacyCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    // Silent fallback — nothing we can do without clipboard access
  }
  document.body.removeChild(ta);
}
