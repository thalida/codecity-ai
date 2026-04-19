// =============================================================================
// tree.js — Left Sidebar Tree View
// CodeCity AI — Renders a collapsible folder/file tree from the manifest.
//
// All functions are declared with `function` keyword so they are hoisted and
// available globally after script concatenation.
// =============================================================================


// -----------------------------------------------------------------------------
// buildTree(node) -> HTMLElement (<ul>)
//
// Recursively creates a nested <ul>/<li> DOM tree from a manifest node.
// Directories are collapsible (click to expand/collapse).
// Files are leaf nodes.
// -----------------------------------------------------------------------------
function buildTree(node) {
  var ul = document.createElement('ul');
  ul.className = 'tree-list';

  var children = node.children || [];
  // Sort: directories first, then files, alphabetically within each group
  var sorted = children.slice().sort(function(a, b) {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  for (var i = 0; i < sorted.length; i++) {
    var child = sorted[i];
    var li = document.createElement('li');
    li.className = 'tree-item';

    if (child.type === 'directory') {
      li.classList.add('tree-dir');
      li.classList.add('tree-collapsed');

      var toggle = document.createElement('span');
      toggle.className = 'tree-toggle';

      var icon = document.createElement('span');
      icon.className = 'tree-icon tree-icon-dir';
      icon.textContent = '\u25B6'; // right-pointing triangle

      var label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = child.name || '';

      toggle.appendChild(icon);
      toggle.appendChild(label);
      li.appendChild(toggle);

      // Build subtree (hidden by default)
      var subtree = buildTree(child);
      subtree.style.display = 'none';
      li.appendChild(subtree);

      // Click handler for expand/collapse
      (function(toggleEl, subtreeEl, iconEl, liEl) {
        toggleEl.addEventListener('click', function(e) {
          e.stopPropagation();
          var isCollapsed = liEl.classList.contains('tree-collapsed');
          if (isCollapsed) {
            liEl.classList.remove('tree-collapsed');
            liEl.classList.add('tree-expanded');
            subtreeEl.style.display = '';
            iconEl.textContent = '\u25BC'; // down-pointing triangle
          } else {
            liEl.classList.add('tree-collapsed');
            liEl.classList.remove('tree-expanded');
            subtreeEl.style.display = 'none';
            iconEl.textContent = '\u25B6'; // right-pointing triangle
          }
        });
      })(toggle, subtree, icon, li);
    } else {
      // File leaf node
      li.classList.add('tree-file');

      var fileIcon = document.createElement('span');
      fileIcon.className = 'tree-icon tree-icon-file';
      fileIcon.textContent = '\u25CB'; // circle (file indicator)

      var fileLabel = document.createElement('span');
      fileLabel.className = 'tree-label';
      fileLabel.textContent = child.name || '';

      li.appendChild(fileIcon);
      li.appendChild(fileLabel);
    }

    ul.appendChild(li);
  }

  return ul;
}


// -----------------------------------------------------------------------------
// showTreeSidebar(manifest)
//
// Populates the #tree-sidebar element with the folder/file tree built from
// the manifest. Clears any existing content first.
// -----------------------------------------------------------------------------
function showTreeSidebar(manifest) {
  var container = document.getElementById('tree-sidebar');
  if (!container) return;

  // Clear previous content
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Header
  var header = document.createElement('div');
  header.className = 'tree-header';

  var title = document.createElement('h3');
  title.className = 'tree-title';
  var tree = manifest.tree || manifest;
  title.textContent = tree.name || 'Project';
  header.appendChild(title);

  container.appendChild(header);

  // Build and append tree
  var treeEl = buildTree(tree);
  treeEl.className = 'tree-list tree-root';
  container.appendChild(treeEl);
}


// CommonJS exports for Vitest (guarded so browser concatenation still works)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildTree,
    showTreeSidebar,
  };
}
