// main.js - Loads and displays tiered data with search and navigation

const DATA_PATHS = {
  azure: 'https://raw.githubusercontent.com/emiliensocchi/azure-tiering/main/Azure%20roles/tiered-azure-roles.json',
  entra: 'https://raw.githubusercontent.com/emiliensocchi/azure-tiering/main/Entra%20roles/tiered-entra-roles.json',
  msgraph: 'https://raw.githubusercontent.com/emiliensocchi/azure-tiering/main/Microsoft%20Graph%20application%20permissions/tiered-msgraph-app-permissions.json',
};

let currentTab = 'azure';
let allData = { azure: [], entra: [], msgraph: [] };

// Utility: fetch JSON
async function fetchData(tab) {
  const resp = await fetch(DATA_PATHS[tab]);
  return await resp.json();
}

// Utility: fetch untiered Entra roles count from markdown table
async function fetchUntieredEntraCount() {
  // Fetch the markdown file as text
  const resp = await fetch('https://raw.githubusercontent.com/emiliensocchi/azure-tiering/main/Entra%20roles/Untiered%20Entra%20roles.md');
  const text = await resp.text();
  // Find the Additions table
  const additionsSection = text.split('### ➕ Additions')[1]?.split('###')[0] || '';
  // Count lines that look like table rows (start with | and not header/separator)
  const lines = additionsSection.split('\n').filter(l => l.startsWith('|') && !l.startsWith('|---') && !l.startsWith('| Detected on'));
  return lines.length;
}

// Utility: fetch untiered MS Graph permissions count from markdown table
async function fetchUntieredMsGraphCount() {
  const resp = await fetch('https://raw.githubusercontent.com/emiliensocchi/azure-tiering/main/Microsoft%20Graph%20application%20permissions/Untiered%20MSGraph%20application%20permissions.md');
  const text = await resp.text();
  // Find the Additions table
  const additionsSection = text.split('### ➕ Additions')[1]?.split('###')[0] || '';
  // Count lines that look like table rows (start with | and not header/separator)
  const lines = additionsSection.split('\n').filter(l => l.startsWith('|') && !l.startsWith('|---') && !l.startsWith('| Detected on'));
  return lines.length;
}

function getTierClass(tab, tier) {
  // Azure: 0-3, Entra/MSGraph: 0-2
  if (tab === 'azure') {
    if (tier === 0 || tier === '0') return 'tier-0';
    if (tier === 1 || tier === '1') return 'tier-1';
    if (tier === 2 || tier === '2') return 'tier-2';
    if (tier === 3 || tier === '3') return 'tier-3';
  } else {
    if (tier === 0 || tier === '0') return 'tier-0';
    if (tier === 1 || tier === '1') return 'tier-1';
    if (tier === 2 || tier === '2') return 'tier-3'; // Use green for Tier 2 in Entra/MS Graph
  }
  return 'tier-x';
}

function getTierLabel(tab, tier) {
  if (tier === undefined || tier === '') return 'Tier ?';
  if (tab === 'azure') {
    if (['0','1','2','3',0,1,2,3].includes(tier)) return 'Tier ' + tier;
  } else {
    if (['0','1','2',0,1,2].includes(tier)) return 'Tier ' + tier;
  }
  return 'Tier ?';
}

function getTierDefinition(assetType, tier) {
  // assetType: 'Azure', 'Entra', 'MSGraph'
  if (tier === undefined || tier === '') return '';
  if (assetType === 'Azure') {
    if (tier === '0') return 'Roles with a risk of privilege escalation via one or multiple resource types in scope.';
    else if (tier === '1') return 'Roles with a risk of lateral movement via data-plane access to a specific resource type in scope, but with a limited risk for privilege escalation.';
    else if (tier === '2') return 'Roles with data-plane access to a specific resource type in scope, but with a limited risk for lateral movement and without a risk for privilege escalation.';
    else if (tier === '3') return 'Roles with little to no security implications.';
  } else if (assetType === 'Entra') {
    if (tier === '0') return 'Roles with a risk of having a direct or indirect path to Global Admin and full tenant takeover.';
    else if (tier === '1') return 'Roles with full access to individual Microsoft 365 services, limited administrative access to Entra ID, or global read access across services, but without a known path to Global Admin.';
    else if (tier === '2') return 'Roles with little to no security implications.';
  } else if (assetType === 'MSGraph') {
    if (tier === '0') return 'Permissions with a risk of having a direct or indirect path to Global Admin and full tenant takeover.';
    else if (tier === '1') return 'Permissions with write access to MS Graph scopes or read access to sensitive scopes (e.g. email content), but without a known path to Global Admin.';
    else if (tier === '2') return 'Permissions with read access to MS Graph scopes and little to no security implications.';
  } 
}

// On load, all tiers are shown, but no filter is selected (all buttons greyed out)
let selectedTiers = { azure: null, entra: null, msgraph: null };

function getSelectedTiers(tab) {
  // If no filter is selected, show all tiers
  if (!selectedTiers[tab] || selectedTiers[tab].length === 0) {
    if (tab === 'azure') return [0,1,2,3];
    return [0,1,2];
  }
  return selectedTiers[tab];
}

function setupTierFilter(tab) {
  const group = document.getElementById('tier-filter-group');
  if (!group) return;
  // Remove any previous listeners by replacing the node
  const newGroup = group.cloneNode(true);
  group.parentNode.replaceChild(newGroup, group);
  newGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.tier-filter-segment');
    if (!btn) return;
    const tier = parseInt(btn.getAttribute('data-tier'));
    // Toggle tier selection (multi-select, allow deselect)
    if (!selectedTiers[tab] || selectedTiers[tab].length === 0) {
      selectedTiers[tab] = [tier];
    } else {
      const idx = selectedTiers[tab].indexOf(tier);
      if (idx === -1) {
        selectedTiers[tab].push(tier);
      } else {
        selectedTiers[tab] = selectedTiers[tab].filter(t => t !== tier);
      }
    }
    renderContent(tab, document.getElementById('searchInputWide').value);
  });
}

function renderTierFilter(tab) {
  let maxTier = 3;
  if (tab === 'entra' || tab === 'msgraph') maxTier = 2;
  // Place label and buttons in the same flex container
  let html = '<div class="is-flex is-align-items-center flex-wrap" id="tier-filter-group" style="margin-bottom:1.5em; gap: 0.5em; justify-content:flex-start; display:flex; flex-wrap:wrap; align-items:center;">';
  html += '<span style="font-size:1em;font-weight:600;color:#3570b3;margin-right:0.7em;letter-spacing:0.01em;white-space:nowrap;">Filter:</span>';
  const selected = selectedTiers[tab] || [];
  for (let i = 0; i <= maxTier; i++) {
    let btnClass = `button tier-filter-segment tier-badge ${getTierClass(tab, i)}`;
    if (selected.includes(i)) {
      btnClass += ' is-selected';
    } else {
      btnClass += ' faded-tier';
    }
    html += `<button class="${btnClass}" data-tier="${i}" type="button" style="margin-right:0.4em; margin-bottom:0.3em;">Tier ${i}</button>`;
  }
  html += '</div>';
  return html;
}

// Renderers for each tab
function renderAzure(data, search = '') {
  const tiers = getSelectedTiers('azure').map(String);
  return data
    .filter(item => item.tier !== undefined && tiers.includes(String(item.tier)))
    .map((item, idx) => {
      const tier = item.tier !== undefined ? item.tier : '';
      const name = item.assetName || item.name || '';
      const id = item.id || '';
      const pathType = item.pathType || '';
      const isDirect = pathType && pathType.toLowerCase() === 'direct';
      // Only match against name and id
      const match = (name + id).toLowerCase().includes(search.toLowerCase());
      if (!match) return '';
      let details = '';
      // Always show Tier definition first
      details += `<div class="tier-definition faded-tier"><span class="is-size-7"><strong>Tier definition:</strong> ${getTierDefinition('Azure', tier)}</span></div>`;
      // Card stack for details
      let detailBlocks = [];
      if (tier === 2 || tier === '2' || tier === 3 || tier === '3') {
        if (item.worstCaseScenario) detailBlocks.push(`
          <div class="popup-section">
            <span class="popup-section-title"><span class="icon">⚠️</span> <strong>Worst-case scenario:</strong></span>
            <span class="popup-section-value">${item.worstCaseScenario}</span>
          </div>`);
      } else {
        if (pathType) detailBlocks.push(`
          <div class="popup-section">
            <span class="popup-section-title"><span class="icon">🛡️</span> <strong>Path Type:</strong></span>
            <span class="popup-section-value">${pathType}${isDirect ? ' <span class=\'crown-emoji\'>💎</span>' : ''}</span>
          </div>`);
        if (item.shortestPath) detailBlocks.push(`
          <div class="popup-section">
            <span class="popup-section-title"><span class="icon">🗡️</span> <strong>Attack Path:</strong></span>
            <span class="popup-section-value">${item.shortestPath}</span>
          </div>`);
        if (item.example) detailBlocks.push(`
          <div class="popup-section">
            <span class="popup-section-title"><span class="icon">💡</span> <strong>Example:</strong></span>
            <span class="popup-section-value">${item.example}</span>
          </div>`);
      }
      details += detailBlocks.join('');
      return `
        <div class="card role-entry" data-idx="${idx}">
          <div class="card-content">
            <span class="tier-badge ${getTierClass('azure', tier)}">${getTierLabel('azure', tier)}</span>
            <strong>${name}</strong>
            ${id ? `<span class="has-text-grey is-size-7">Role Id: ${id}</span>` : ''}
            <span class="icon is-pulled-right"><i class="fas fa-chevron-down"></i></span>
            ${isDirect ? '<span class="crown-emoji-entry" style="display:inline-block; float:none; font-size:0.95em; margin-left:0.4em; vertical-align:middle; opacity:0.85; position:relative; top:2px;">💎</span>' : ''}
            <div class="role-details" style="display:none; margin-top:0.7em;">
              ${details}
            </div>
          </div>
        </div>
      `;
    }).join('') || '<p>No results found.</p>';
}

function renderEntra(data, search = '') {
  const tiers = getSelectedTiers('entra').map(String);
  return data
    .filter(item => item.tier !== undefined && tiers.includes(String(item.tier)))
    .map((item, idx) => {
      const tier = item.tier !== undefined ? item.tier : '';
      const name = item.assetName || item.name || '';
      const id = item.id || '';
      const pathType = item.pathType || '';
      const isDirect = pathType && pathType.toLowerCase() === 'direct';
      // Only match against name and id
      const match = (name + id).toLowerCase().includes(search.toLowerCase());
      if (!match) return '';
      let details = '';
      // Always show Tier definition first
      details += `<div class="tier-definition faded-tier"><span class="is-size-7"><strong>Tier definition:</strong> ${getTierDefinition('Entra', tier)}</span></div>`;
      let detailBlocks = [];
      if (tier === 1 || tier === '1') {
        if (item.providesFullAccessTo) detailBlocks.push(`
          <div class="popup-section">
            <span class="popup-section-title"><span class="icon">🔓</span> <strong>Provides full access to:</strong></span>
            <span class="popup-section-value">${item.providesFullAccessTo}</span>
          </div>`);
      } else {
        if (pathType) detailBlocks.push(`
          <div class="popup-section">
            <span class="popup-section-title"><span class="icon">🛡️</span> <strong>Path Type:</strong></span>
            <span class="popup-section-value">${pathType}${isDirect ? ' <span class=\'crown-emoji\'>💎</span>' : ''}</span>
          </div>`);
        if (item.shortestPath) detailBlocks.push(`
          <div class="popup-section">
            <span class="popup-section-title"><span class="icon">🗡️</span> <strong>Attack Path:</strong></span>
            <span class="popup-section-value">${item.shortestPath}</span>
          </div>`);
        if (item.example) detailBlocks.push(`
          <div class="popup-section">
            <span class="popup-section-title"><span class="icon">💡</span> <strong>Example:</strong></span>
            <span class="popup-section-value">${item.example}</span>
          </div>`);
      }
      details += detailBlocks.join('');
      return `
        <div class="card role-entry" data-idx="${idx}">
          <div class="card-content">
            <span class="tier-badge ${getTierClass('entra', tier)}">${getTierLabel('entra', tier)}</span>
            <strong>${name}</strong>
            ${id ? `<span class="has-text-grey is-size-7">Role Id: ${id}</span>` : ''}
            <span class="icon is-pulled-right"><i class="fas fa-chevron-down"></i></span>
            ${isDirect ? '<span class="crown-emoji-entry" style="display:inline-block; float:none; font-size:0.95em; margin-left:0.4em; vertical-align:middle; opacity:0.85; position:relative; top:2px;">💎</span>' : ''}
            <div class="role-details" style="display:none; margin-top:0.7em;">
              ${details}
            </div>
          </div>
        </div>
      `;
    }).join('') || '<p>No results found.</p>';
}

function renderMsGraph(data, search = '') {
  const tiers = getSelectedTiers('msgraph').map(String);
  return data
    .filter(item => item.tier !== undefined && tiers.includes(String(item.tier)))
    .map((item, idx) => {
      const tier = item.tier !== undefined ? item.tier : '';
      const name = item.assetName || item.name || '';
      const id = item.id || '';
      const pathType = item.pathType || '';
      const isDirect = pathType && pathType.toLowerCase() === 'direct';
      // Only match against name and id
      const match = (name + id).toLowerCase().includes(search.toLowerCase());
      if (!match) return '';
      let details = '';
      // Always show Tier definition first
      details += `<div class="tier-definition faded-tier"><span class="is-size-7"><strong>Tier definition:</strong> ${getTierDefinition('MSGraph', tier)}</span></div>`;
      let detailBlocks = [];
      if (pathType) detailBlocks.push(`
        <div class="popup-section">
          <span class="popup-section-title"><span class="icon">🛡️</span> <strong>Path Type:</strong></span>
          <span class="popup-section-value">${pathType}${isDirect ? ' <span class=\'crown-emoji\'>💎</span>' : ''}</span>
        </div>`);
      if (item.shortestPath) detailBlocks.push(`
        <div class="popup-section">
          <span class="popup-section-title"><span class="icon">🗡️</span> <strong>Attack Path:</strong></span>
          <span class="popup-section-value">${item.shortestPath}</span>
        </div>`);
      if (item.example) detailBlocks.push(`
        <div class="popup-section">
          <span class="popup-section-title"><span class="icon">💡</span> <strong>Example:</strong></span>
          <span class="popup-section-value">${item.example}</span>
        </div>`);
      details += detailBlocks.join('');
      return `
        <div class="card role-entry" data-idx="${idx}">
          <div class="card-content">
            <span class="tier-badge ${getTierClass('msgraph', tier)}">${getTierLabel('msgraph', tier)}</span>
            <strong>${name}</strong>
            ${id ? `<span class="has-text-grey is-size-7">Role Id: ${id}</span>` : ''}
            <span class="icon is-pulled-right"><i class="fas fa-chevron-down"></i></span>
            ${isDirect ? '<span class="crown-emoji-entry" style="display:inline-block; float:none; font-size:0.95em; margin-left:0.4em; vertical-align:middle; opacity:0.85; position:relative; top:2px;">💎</span>' : ''}
            <div class="role-details" style="display:none; margin-top:0.7em;">
              ${details}
            </div>
          </div>
        </div>
      `;
    }).join('') || '<p>No results found.</p>';
}

async function renderContent(tab, search = '') {
  let html = '';
  if (tab === 'azure') {
    html += '<div class="section-label has-text-grey is-size-7" style="margin-bottom:0.7em; font-weight:500;">Currently untiered: n/a (supports only common roles)</div>';
  } else if (tab === 'entra') {
    let b = allData.entra.filter(item => item.id).length;
    let a = window._untieredEntraCount || 0;
    let c = b + a;
    html += `<div class="section-label has-text-grey is-size-7" style="margin-bottom:0.7em; font-weight:500;">Currently untiered: ${a}/${c} (<a href='https://github.com/emiliensocchi/azure-tiering/blob/main/Entra%20roles/Untiered%20Entra%20roles.md' style='text-decoration:underline;color:inherit;'>more info</a>)</div>`;
  } else if (tab === 'msgraph') {
    let b = allData.msgraph.filter(item => item.id).length;
    let a = window._untieredMsGraphCount || 0;
    let c = b + a;
    html += `<div class="section-label has-text-grey is-size-7" style="margin-bottom:0.7em; font-weight:500;">Currently untiered: ${a}/${c} (<a href='https://github.com/emiliensocchi/azure-tiering/blob/main/Microsoft%20Graph%20application%20permissions/Untiered%20MSGraph%20application%20permissions.md' style='text-decoration:underline;color:inherit;'>more info</a>)</div>`;
  }
  html += renderTierFilter(tab);
  html += '<div class="field" style="margin-bottom:1.5em; position:relative;">' +
    '<div class="control has-icons-left has-icons-right">' +
      '<input class="input is-medium" type="text" id="searchInputWide" placeholder="Search by name or Id">' +
      '<span class="icon is-left">' +
        '<i class="fas fa-search"></i>' +
      '</span>' +
      '<span class="icon is-right" id="search-clear-btn"><i class="fas fa-times"></i></span>' +
    '</div>' +
  '</div>';
  if (tab === 'azure') html += renderAzure(allData.azure, search);
  if (tab === 'entra') html += renderEntra(allData.entra, search);
  if (tab === 'msgraph') html += renderMsGraph(allData.msgraph, search);
  document.getElementById('content-area').innerHTML = html;
  setupTierFilter(tab);
  setupRoleEntryToggles(tab);
  // After rendering the search bar, set up the clear (cross) button logic
  const wideInput = document.getElementById('searchInputWide');
  const clearBtn = document.getElementById('search-clear-btn');
  if (wideInput) {
    wideInput.value = search;
    // Remove previous event listeners by cloning
    const wideInputClone = wideInput.cloneNode(true);
    wideInput.parentNode.replaceChild(wideInputClone, wideInput);
    wideInputClone.value = search;
    // Show/hide clear button based on input
    function updateClearBtn() {
      if (wideInputClone.value.length > 0) {
        clearBtn.classList.add('visible');
      } else {
        clearBtn.classList.remove('visible');
      }
    }
    wideInputClone.addEventListener('input', e => {
      updateClearBtn();
      const value = e.target.value;
      filterRoleEntries(currentTab, value);
    });
    wideInputClone.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        wideInputClone.blur();
      }
    });
    updateClearBtn();
    // Clear button click handler
    clearBtn.onclick = function() {
      wideInputClone.value = '';
      updateClearBtn();
      filterRoleEntries(currentTab, '');
      wideInputClone.focus();
    };
  }
}

// Add this function to filter entries without re-rendering the input
function filterRoleEntries(tab, search) {
  let html = '';
  if (tab === 'azure') html = renderAzure(allData.azure, search);
  if (tab === 'entra') html = renderEntra(allData.entra, search);
  if (tab === 'msgraph') html = renderMsGraph(allData.msgraph, search);
  // Replace only the entries, not the whole content
  const contentArea = document.getElementById('content-area');
  if (!contentArea) return;
  // Find the first .field (search bar) and tier filter, keep them, replace the rest
  const nodes = Array.from(contentArea.children);
  let lastStaticIdx = 0;
  for (let i = 0; i < nodes.length; ++i) {
    if (nodes[i].classList.contains('field')) {
      lastStaticIdx = i;
    }
  }
  // Remove all nodes after the search bar
  while (contentArea.children.length > lastStaticIdx + 1) {
    contentArea.removeChild(contentArea.lastChild);
  }
  // Insert new entries
  const temp = document.createElement('div');
  temp.innerHTML = html;
  Array.from(temp.children).forEach(child => {
    contentArea.appendChild(child);
  });
  setupRoleEntryToggles(tab);
}

function setupRoleEntryToggles(tab) {
  const entries = document.querySelectorAll('.role-entry');
  entries.forEach(entry => {
    entry.addEventListener('click', function(e) {
      // Prevent event bubbling if clicking inside details
      if (e.target.closest('.role-details')) return;
      const details = this.querySelector('.role-details');
      if (details) {
        // Hide all other details first (accordion behavior)
        document.querySelectorAll('.role-details').forEach(d => {
          if (d !== details) d.style.display = 'none';
        });
        // Toggle current
        details.style.display = details.style.display === 'none' || details.style.display === '' ? 'block' : 'none';
        const icon = this.querySelector('.icon i');
        if (icon) {
          icon.classList.toggle('fa-chevron-down');
          icon.classList.toggle('fa-chevron-up');
        }
      }
    });
  });
}

// Tab navigation
function setupTabs() {
  const tabList = document.getElementById('main-tabs');
  if (!tabList) return;
  // Replace the entire #main-tabs element with a minimalistic triple toggle switch using images and a sliding effect
  const toggle = document.createElement('div');
  toggle.className = 'tab-toggle-switch';
  toggle.innerHTML = `
    <div class="tab-toggle-slider"></div>
    <button class="tab-toggle-btn toggle-left" data-tab="azure"><img src="images/azure.png" alt="Azure">Azure Roles</button>
    <button class="tab-toggle-btn toggle-middle" data-tab="entra"><img src="images/entraid.png" alt="Entra">Entra Roles</button>
    <button class="tab-toggle-btn toggle-right" data-tab="msgraph"><img src="images/msgraph.png" alt="MS Graph">MS Graph Application Permissions</button>
  `;
  tabList.parentNode.replaceChild(toggle, tabList);

  const slider = toggle.querySelector('.tab-toggle-slider');
  const btns = toggle.querySelectorAll('.tab-toggle-btn');
  const tabOrder = ['azure', 'entra', 'msgraph'];

  function updateToggleActive() {
    btns.forEach(btn => {
      btn.classList.remove('is-active');
      if (btn.getAttribute('data-tab') === currentTab) btn.classList.add('is-active');
    });
    // Move slider
    const idx = tabOrder.indexOf(currentTab);
    // Desktop: horizontal slider
    if (window.innerWidth > 700) {
      slider.style.left = `calc(${idx * 33.333}% + 0.15em)`;
      slider.style.top = '0.15em';
      slider.style.width = 'calc(33.333% - 0.2em)';
      slider.style.height = 'calc(100% - 0.3em)';
    } else {
      // Mobile: vertical slider
      slider.style.left = '0.15em';
      slider.style.width = 'calc(100% - 0.3em)';
      slider.style.height = 'calc(33.333% - 0.2em)';
      slider.style.top = `calc(${idx} * 33.333% + 0.15em)`;
      slider.style.setProperty('--slider-idx', idx);
    }
    // Optionally, update background gradient for each tab
    if (idx === 0) slider.style.background = 'linear-gradient(90deg, #4a90e2 60%, #3570b3 100%)';
    else if (idx === 1) slider.style.background = 'linear-gradient(90deg, #3570b3 60%, #4a90e2 100%)';
    else slider.style.background = 'linear-gradient(90deg, #3570b3 60%, #4a90e2 100%)';
  }

  btns.forEach(btn => {
    btn.onclick = () => {
      currentTab = btn.getAttribute('data-tab');
      updateToggleActive();
      renderContent(currentTab, document.getElementById('searchInputWide') ? document.getElementById('searchInputWide').value : '');
    };
  });
  window.addEventListener('resize', updateToggleActive);
  updateToggleActive();
}

// Add Disclaimer button and popup logic
function addDisclaimerButton() {
  // Disclaimer button is now in HTML and styled with .disclaimer-btn-custom
  const btn = document.getElementById('disclaimer-btn');
  if (btn && !btn.hasAttribute('data-setup')) {
    btn.setAttribute('data-setup', 'true');
    btn.addEventListener('click', showDisclaimerPopup);
  }
  // Responsive: change title text on mobile
  function updateTitleForMobile() {
    const title = document.getElementById('main-title');
    if (!title) return;
    if (window.innerWidth <= 600) {
      title.textContent = '🌩️ AzTier';
    } else {
      title.textContent = '🌩️ Azure Administrative Tiering (AzTier)';
    }
  }
  window.addEventListener('resize', updateTitleForMobile);
  updateTitleForMobile();
}

function showDisclaimerPopup() {
  if (document.getElementById('disclaimer-popup')) return;
  const popup = document.createElement('div');
  popup.id = 'disclaimer-popup';
  popup.innerHTML = [
    '<div class="disclaimer-modal-bg"></div>',
    '<div class="disclaimer-modal-box">',
      '<div class="info-section">',
        '<div class="info-section-title"><span class="icon">ℹ️</span> <strong>About</strong></div>',
        '<div class="info-section-content" style="margin-bottom:1.5em; font-size:1.1em;">This is a simple frontend for the <a href="https://github.com/emiliensocchi/azure-tiering">Azure Administrative Tiering (AzTier)</a> project.</div>',
      '</div>',
      '<div class="info-section">',
        '<div class="info-section-title"><span class="icon">📢</span> <strong>Disclaimer</strong></div>',
        '<div class="info-section-content" style="margin-bottom:1.2em; font-size:1.05em;">AzTier is not a Microsoft service or product, but a personal project with no implicit or explicit obligations. For more information, see the project\'s <a href=https://github.com/emiliensocchi/azure-tiering?tab=readme-ov-file#-disclaimer>original disclaimer</a>.</div>',
      '</div>',
      '<button class="button is-primary" id="close-disclaimer">Close</button>',
    '</div>'
  ].join('');
  document.body.appendChild(popup);
  document.getElementById('close-disclaimer').onclick = () => popup.remove();
  popup.querySelector('.disclaimer-modal-bg').onclick = () => popup.remove();
}

// Initial load
async function init() {
  allData.azure = await fetchData('azure');
  allData.entra = await fetchData('entra');
  allData.msgraph = await fetchData('msgraph');
  // Fetch untiered Entra count and store globally for use in renderContent
  window._untieredEntraCount = await fetchUntieredEntraCount();
  window._untieredMsGraphCount = await fetchUntieredMsGraphCount();
  renderContent(currentTab);
  setupTabs();
  addDisclaimerButton();
}

document.addEventListener('DOMContentLoaded', init);
