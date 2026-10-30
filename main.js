// main.js - AzTier frontend: loads tiered assets and renders the tiering console.
(function () {
  'use strict';

  const SCOPES = {
    azure: { label: 'Azure roles', sub: 'RBAC · built-in', icon: 'images/azure.png', tiers: ['0', '1', '2', '3'], hasPath: false },
    entra: { label: 'Entra roles', sub: 'Directory roles', icon: 'images/entraid.png', tiers: ['0', '1', '2'], hasPath: true },
    msgraph: { label: 'MS Graph', sub: 'Application permissions', icon: 'images/msgraph.png', tiers: ['0', '1', '2'], hasPath: true },
  };
  const TARGETS = {
    azure: { 0: 'Privilege escalation', 1: 'Lateral movement', 2: 'Data-plane access', 3: 'Minimal impact' },
    entra: { 0: 'Global Admin', 1: 'M365 / restricted Entra admin', 2: 'Unprivileged admin' },
    msgraph: { 0: 'Global Admin', 1: 'Restricted Graph scope', 2: 'Unprivileged access' },
  };
  const TABS = Object.keys(SCOPES);

  const data = { names: {}, definitions: {}, tiered: { azure: [], entra: [], msgraph: [] }, untiered: { azure: null, entra: null, msgraph: null } };
  let loaded = false;
  let loadError = null;
  let refIndex = null;
  const navHistory = [];
  const state = { tab: 'azure', tiers: [], pathType: 'all', search: '', selectedId: null, showUntiered: false, sort: 'tier' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tierClass = (t) => (t === null || t === undefined ? 'tx' : `t${t}`);
  const tierLabel = (t) => (t === null || t === undefined ? 'T?' : `T${t}`);
  const familyName = (tab, t) => data.names?.[tab]?.[`tier_${t}`] || '';
  const familyDef = (tab, t) => data.definitions?.[tab]?.[`tier_${t}`] || '';
  const narrow = () => window.matchMedia('(max-width: 960px)').matches;

  // ---------- Data ----------

  const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const httpsOnly = (v) => (/^https:\/\//.test(str(v)) ? str(v, 1000) : '');

  function normalize(list, tiered) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((x) => x && typeof x === 'object' && typeof x.assetName === 'string')
      .map((x) => ({
        id: str(x.id, 200) || str(x.assetName, 200),
        tier: tiered && ['0', '1', '2', '3'].includes(String(x.tier)) ? String(x.tier) : null,
        name: str(x.assetName, 300),
        definition: str(x.assetDefinition),
        docUri: httpsOnly(x.documentationUri),
        pathType: str(x.pathType, 40),
        shortestPath: str(x.shortestPath),
        example: str(x.example),
        worstCase: str(x.worstCaseScenario),
        fullAccessTo: str(x.providesFullAccessTo),
        detectedOn: str(x.detectedOn, 40),
        apiEvent: str(x.apiEvent, 40),
      }));
  }

  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function loadAll() {
    const config = await getJson('./config.json');
    const tiered = config.tiered_asset_uris || {};
    const untiered = config.untiered_asset_uris || {};
    const [defs, ...lists] = await Promise.all([
      getJson(config.tier_definitions).catch(() => ({})),
      ...TABS.map((t) => (tiered[t] ? getJson(tiered[t]) : Promise.resolve([]))),
      ...TABS.map((t) => (untiered[t] ? getJson(untiered[t]).catch(() => null) : Promise.resolve(null))),
    ]);
    data.names = defs.tier_names || {};
    data.definitions = defs.tier_definitions || {};
    TABS.forEach((t, i) => {
      data.tiered[t] = normalize(lists[i], true);
      const u = lists[TABS.length + i];
      data.untiered[t] = u === null ? null : normalize(u, false);
    });
  }

  // ---------- URL hash (#<tab>[-tier-<n>...][?asset=<id>]) ----------

  function readHash() {
    const raw = decodeURIComponent(window.location.hash.slice(1));
    if (!raw) return;
    const [path, query = ''] = raw.split('?');
    const [tab, ...rest] = path.split('-');
    if (!TABS.includes(tab)) return;
    state.tab = tab;
    state.tiers = rest[0] === 'tier' ? rest.slice(1).filter((t) => SCOPES[tab].tiers.includes(t)) : [];
    const asset = new URLSearchParams(query).get('asset');
    state.selectedId = asset ? asset.slice(0, 200) : null;
    state.showUntiered = false;
  }

  function writeHash() {
    let hash = state.tab;
    if (state.tiers.length) hash += `-tier-${state.tiers.join('-')}`;
    if (state.selectedId) hash += `?asset=${encodeURIComponent(state.selectedId)}`;
    if (window.location.hash.slice(1) !== hash) history.replaceState(null, '', `#${hash}`);
  }

  // ---------- State ----------

  function setState(patch) {
    if (patch.tab && patch.tab !== state.tab) Object.assign(state, { selectedId: null, tiers: [], showUntiered: false });
    Object.assign(state, patch);
    writeHash();
    render();
  }

  function currentPool() {
    return state.showUntiered ? data.untiered[state.tab] || [] : data.tiered[state.tab];
  }

  function matches(a) {
    const q = state.search.trim().toLowerCase();
    return (
      (state.showUntiered || state.tiers.length === 0 || state.tiers.includes(a.tier)) &&
      (state.showUntiered || !SCOPES[state.tab].hasPath || state.pathType === 'all' || a.pathType.toLowerCase() === state.pathType) &&
      (!q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
    );
  }

  function visibleAssets() {
    return currentPool()
      .filter(matches)
      .sort((a, b) =>
        state.sort === 'name' ? a.name.localeCompare(b.name) : (a.tier ?? '9').localeCompare(b.tier ?? '9') || a.name.localeCompare(b.name),
      );
  }

  // ---------- Cross-references in shortest paths ----------

  // Exact asset names only, longest first so "Storage Account Contributor" wins over "Contributor".
  function buildRefIndex() {
    const byName = new Map();
    for (const tab of TABS) {
      for (const a of data.tiered[tab]) {
        if (!a.name) continue;
        if (!byName.has(a.name)) byName.set(a.name, []);
        byName.get(a.name).push({ tab, id: a.id, tier: a.tier, name: a.name });
      }
    }
    const names = [...byName.keys()].sort((x, y) => y.length - x.length);
    if (!names.length) return null;
    const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Graph permission names contain dots, so a trailing "." only blocks a match when followed by a word char.
    const re = new RegExp(`(?<![\\w.-])(${names.map(reEsc).join('|')})(?![\\w-]|\\.\\w)`, 'g');
    return { byName, re };
  }

  function linkifyAssets(text, self) {
    if (!refIndex || !text) return esc(text);
    let out = '';
    let last = 0;
    for (const m of text.matchAll(refIndex.re)) {
      const candidates = refIndex.byName.get(m[1]);
      const target = candidates.find((c) => c.tab === state.tab) || candidates[0];
      out += esc(text.slice(last, m.index));
      if (target.id === self.id && target.tab === state.tab) {
        out += esc(m[1]);
      } else {
        const where = target.tab === state.tab ? '' : ` · ${SCOPES[target.tab].label}`;
        out += `<button type="button" class="ref ${tierClass(target.tier)}" data-ref-tab="${target.tab}" data-ref-id="${esc(target.id)}" title="Open ${esc(target.name)} (${tierLabel(target.tier)}${esc(where)})"><span class="ref-tier">${tierLabel(target.tier)}</span>${esc(m[1])}</button>`;
      }
      last = m.index + m[1].length;
    }
    return out + esc(text.slice(last));
  }

  function openAsset(tab, id, { remember = true } = {}) {
    if (remember && state.selectedId) navHistory.push({ tab: state.tab, id: state.selectedId });
    const patch = { tab, selectedId: id };
    const target = data.tiered[tab].find((x) => x.id === id);
    const tabReset = tab !== state.tab;
    if (!tabReset && (state.showUntiered || !target || !matches(target))) {
      Object.assign(patch, { tiers: [], pathType: 'all', search: '', showUntiered: false });
    }
    setState(patch);
    if (tabReset && target && !matches(target)) setState({ pathType: 'all', search: '' });
    focusDetail();
  }

  function scrollSelectedRowIntoTable() {
    const wrap = document.querySelector('.table-wrap');
    const row = document.querySelector('tr[aria-selected="true"]');
    if (!wrap || !row) return;
    const head = wrap.querySelector('thead')?.offsetHeight || 0;
    const top = row.offsetTop - head;
    const bottom = row.offsetTop + row.offsetHeight - wrap.clientHeight;
    if (wrap.scrollTop > top) wrap.scrollTop = top;
    else if (wrap.scrollTop < bottom) wrap.scrollTop = bottom;
  }

  function focusDetail() {
    requestAnimationFrame(() => {
      scrollSelectedRowIntoTable();
      $('detail').scrollTop = 0;
      if (narrow()) $('detail').scrollIntoView({ block: 'start', behavior: 'smooth' });
      $('detail').querySelector('h2')?.focus({ preventScroll: true });
    });
  }

  // ---------- Rendering ----------

  function renderScopes() {
    $('scope-tabs').innerHTML = TABS.map((key) => {
      const s = SCOPES[key];
      const sel = state.tab === key;
      return `<button type="button" class="scope" role="tab" data-tab="${key}" aria-selected="${sel}" tabindex="${sel ? 0 : -1}">
        <img src="${s.icon}" alt="" width="28" height="28">
        <span><span class="scope-label">${esc(s.label)}</span><span class="scope-sub">${esc(s.sub)}</span></span>
        <span class="scope-count">${loaded ? data.tiered[key].length : '—'}</span>
      </button>`;
    }).join('');
  }

  function renderOverview() {
    const scope = SCOPES[state.tab];
    if (!loaded) {
      $('heatbar').innerHTML = '';
      $('tier-cards').innerHTML = '';
      return;
    }
    const list = data.tiered[state.tab];
    const counts = Object.fromEntries(scope.tiers.map((t) => [t, list.filter((a) => a.tier === t).length]));
    const total = list.length || 1;
    const filtering = state.tiers.length > 0 || state.showUntiered;
    const isOn = (t) => !state.showUntiered && state.tiers.includes(t);

    $('heatbar').innerHTML = scope.tiers
      .map((t) => `<span class="${tierClass(t)} ${filtering && !isOn(t) ? 'dim' : ''}" style="flex-grow:${counts[t]};background:var(--c)" title="Tier ${t}: ${counts[t]}"></span>`)
      .join('');

    const untiered = data.untiered[state.tab];
    $('tier-cards').className = `tier-cards ${filtering ? 'filtering' : ''}`;
    $('tier-cards').innerHTML =
      scope.tiers
        .map(
          (t) => `<button type="button" class="tier-card ${tierClass(t)}" data-tier="${t}" aria-pressed="${isOn(t)}" title="${esc(familyDef(state.tab, t))}">
            <span class="tc-head"><span class="tc-tier">TIER ${t}</span><span class="tc-pct">${Math.round((counts[t] / total) * 100)}%</span></span>
            <span class="tc-count">${counts[t]}</span>
            <span class="tc-name">${esc(familyName(state.tab, t))}</span>
          </button>`,
        )
        .join('') +
      (untiered
        ? `<button type="button" class="tier-card untiered" data-untiered="1" aria-pressed="${state.showUntiered}">
            <span class="tc-head"><span class="tc-tier">UNTIERED</span><span class="tc-pct">triage queue</span></span>
            <span class="tc-count">${untiered.length}</span>
            <span class="tc-name">New or changed, awaiting analysis</span>
          </button>`
        : `<div class="tier-card untiered" aria-disabled="true">
            <span class="tc-head"><span class="tc-tier">UNTIERED</span></span>
            <span class="tc-count">n/a</span>
            <span class="tc-name">Only common Azure roles are tiered</span>
          </div>`);
  }

  function renderToolbar(count) {
    const seg = $('path-seg');
    seg.hidden = !SCOPES[state.tab].hasPath || state.showUntiered;
    seg.innerHTML = [['all', 'All paths'], ['direct', '◆ Direct'], ['indirect', '◇ Indirect']]
      .map(([v, l]) => `<button type="button" role="radio" data-path="${v}" aria-checked="${state.pathType === v}" tabindex="${state.pathType === v ? 0 : -1}">${l}</button>`)
      .join('');
    if (document.activeElement !== $('search')) $('search').value = state.search;
    $('sort').value = state.sort;
    $('result-count').textContent = loaded ? `${count} / ${currentPool().length} ${state.showUntiered ? 'untiered' : 'assets'}` : '';
  }

  function renderRows(list) {
    const showPath = SCOPES[state.tab].hasPath && !state.showUntiered;
    $('third-col').textContent = state.showUntiered ? 'Event' : showPath ? 'Path' : 'Scope';
    $('asset-rows').innerHTML = list
      .map((a) => {
        const pt = a.pathType.toLowerCase();
        const third = state.showUntiered
          ? `<span class="path-tag">${esc(a.apiEvent || '—')}</span>`
          : showPath
            ? `<span class="path-tag ${esc(pt)}">${esc(a.pathType || '—')}</span>`
            : '<span class="path-tag">RBAC</span>';
        return `<tr data-id="${esc(a.id)}" aria-selected="${a.id === state.selectedId}">
          <td><span class="pill ${tierClass(a.tier)}">${tierLabel(a.tier)}</span></td>
          <td><button type="button" class="asset-btn" data-id="${esc(a.id)}">${esc(a.name)}</button></td>
          <td>${third}</td>
          <td class="id-cell" title="${esc(a.id)}">${esc(a.id.slice(0, 8))}…</td>
        </tr>`;
      })
      .join('');
    $('empty').hidden = list.length > 0 || !loaded;
  }

  function renderChain(a) {
    const tab = state.tab;
    const target = TARGETS[tab][a.tier] ?? 'Unknown';
    const pt = a.pathType.toLowerCase();
    const steps = [`<li><div class="node src"><small>Granted</small><span>${esc(a.name)}</span></div></li>`];
    if (tab === 'azure') {
      steps.push('<li><div class="edge">at assigned scope</div></li>');
    } else if (pt === 'indirect') {
      steps.push('<li><div class="edge">abuse</div></li>');
      steps.push('<li><div class="node pivot"><small>Pivot</small><span>Identity / resource</span></div></li>');
      steps.push('<li><div class="edge">escalate</div></li>');
    } else if (pt === 'direct') {
      steps.push('<li><div class="edge direct">direct</div></li>');
    } else {
      steps.push('<li><div class="edge">leads to</div></li>');
    }
    steps.push(`<li><div class="node target"><small>Reach</small><span>${esc(target)}</span></div></li>`);
    return `<ol class="chain ${tierClass(a.tier)}" aria-label="Attack path from ${esc(a.name)} to ${esc(target)}">${steps.join('')}</ol>`;
  }

  function highlightScenario(text) {
    return esc(text).replace(/\bTA\b/g, '<abbr title="Threat actor">TA</abbr>');
  }

  function renderDetail() {
    const el = $('detail');
    if (!loaded) {
      el.innerHTML = `<div class="detail-empty">${loadError ? esc(loadError) : 'Loading tiering data…'}</div>`;
      return;
    }
    const a = currentPool().find((x) => x.id === state.selectedId);
    if (!a) {
      el.innerHTML = '<div class="detail-empty">Select an asset to inspect its tier and attack path.<br><br>↑ ↓ to move · / to search</div>';
      return;
    }
    const tc = tierClass(a.tier);
    const sections = [];
    if (a.tier !== null) {
      // Azure tiers 2-3 have no escalation path; they document a worst-case scenario instead.
      const lowImpactAzure = state.tab === 'azure' && (a.tier === '2' || a.tier === '3');
      sections.push(`<div class="d-sec"><h3>Attack path</h3>${renderChain(a)}</div>`);
      if (!lowImpactAzure && a.shortestPath) sections.push(`<div class="d-sec"><h3>Shortest path</h3><p>${linkifyAssets(a.shortestPath, a)}</p></div>`);
      if (a.fullAccessTo) sections.push(`<div class="d-sec"><h3>Full access to</h3><p>${esc(a.fullAccessTo)}</p></div>`);
      if (a.worstCase) sections.push(`<div class="d-sec"><h3>Worst-case scenario</h3><div class="callout ${tc}">${esc(a.worstCase)}</div></div>`);
      if (!lowImpactAzure && a.example) sections.push(`<div class="d-sec"><h3>Example</h3><div class="scenario"><span class="prompt">$ </span>${highlightScenario(a.example)}</div></div>`);
      sections.push(`<div class="d-sec"><h3>Tier ${a.tier} · ${esc(familyName(state.tab, a.tier))}</h3><p class="soft">${esc(familyDef(state.tab, a.tier))}</p></div>`);
    } else {
      sections.push(`<div class="d-sec"><h3>Status</h3><div class="callout tx">Awaiting triage: ${esc(a.apiEvent || 'detected')} on ${esc(a.detectedOn || 'unknown date')}.</div></div>`);
    }
    if (a.definition) sections.push(`<div class="d-sec"><h3>Microsoft definition</h3><p class="soft">${esc(a.definition)}</p></div>`);
    sections.push(`<div class="d-sec"><h3>Identifiers</h3><dl class="meta">
        <dt>id</dt><dd><span>${esc(a.id)}</span><button type="button" class="copy-btn" data-copy="${esc(a.id)}">copy</button></dd>
        ${a.pathType ? `<dt>path</dt><dd>${esc(a.pathType)}</dd>` : ''}
      </dl></div>`);
    const actions = [];
    if (a.docUri) actions.push(`<a class="primary-btn" href="${esc(a.docUri)}" target="_blank" rel="noopener">Microsoft docs ↗</a>`);
    actions.push('<button type="button" class="ghost-btn" data-share="1">Copy link</button>');
    sections.push(`<div class="d-actions">${actions.join('')}</div>`);

    const prev = navHistory[navHistory.length - 1];
    const prevAsset = prev && data.tiered[prev.tab].find((x) => x.id === prev.id);
    const back = prevAsset ? `<button type="button" class="back-btn" data-back="1">← Back to ${esc(prevAsset.name)}</button>` : '';
    el.innerHTML = `<div class="${tc}">
      <div class="d-head">
        ${back}
        <div class="row"><span class="pill ${tc}">${a.tier !== null ? `TIER ${a.tier}` : 'UNTIERED'}</span>
          ${a.pathType.toLowerCase() === 'direct' ? '<span class="path-tag direct">Direct path to Global Admin</span>' : ''}</div>
        <h2 tabindex="-1">${esc(a.name)}</h2>
        ${a.tier !== null ? `<span class="d-family">${esc(familyName(state.tab, a.tier))}</span>` : ''}
      </div>
      <div class="d-body">${sections.join('')}</div>
    </div>`;
  }

  function render() {
    renderScopes();
    renderOverview();
    const list = loaded ? visibleAssets() : [];
    renderToolbar(list.length);
    renderRows(list);
    renderDetail();
    const banner = document.querySelector('.banner');
    if (loadError && !banner) $('scope-tabs').insertAdjacentHTML('beforebegin', `<p class="banner" role="alert">${esc(loadError)}</p>`);
    if (!loadError && banner) banner.remove();
  }

  function setSync(kind, text) {
    $('sync-status').className = `sync ${kind}`;
    $('sync-text').textContent = text;
  }

  // ---------- Events ----------

  function selectRow(id, focus) {
    navHistory.length = 0;
    setState({ selectedId: id });
    if (focus) document.querySelector(`.asset-btn[data-id="${CSS.escape(id)}"]`)?.focus();
    else if (narrow()) focusDetail();
  }

  async function copyText(btn, text, label) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'copied';
    } catch {
      btn.textContent = 'n/a';
    }
    setTimeout(() => (btn.textContent = label), 1200);
  }

  function wire() {
    $('scope-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b && b.dataset.tab !== state.tab) {
        navHistory.length = 0;
        setState({ tab: b.dataset.tab });
      }
    });
    $('scope-tabs').addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const i = (TABS.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      navHistory.length = 0;
      setState({ tab: TABS[i] });
      document.querySelector(`[data-tab="${TABS[i]}"]`)?.focus();
    });
    $('tier-cards').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.untiered) return setState({ showUntiered: !state.showUntiered, selectedId: null });
      const t = b.dataset.tier;
      const tiers = state.tiers.includes(t) ? state.tiers.filter((x) => x !== t) : [...state.tiers, t].sort();
      setState({ tiers, showUntiered: false });
    });
    $('path-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-path]');
      if (b) setState({ pathType: b.dataset.path });
    });
    $('search').addEventListener('input', (e) => setState({ search: e.target.value.slice(0, 200) }));
    $('sort').addEventListener('change', (e) => setState({ sort: e.target.value }));
    $('asset-rows').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) selectRow(tr.dataset.id, false);
    });
    $('asset-rows').addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const btns = [...document.querySelectorAll('.asset-btn')];
      const i = btns.indexOf(document.activeElement);
      const next = btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) selectRow(next.dataset.id, true);
    });
    $('detail').addEventListener('click', (e) => {
      const ref = e.target.closest('[data-ref-id]');
      if (ref) return openAsset(ref.dataset.refTab, ref.dataset.refId);
      if (e.target.closest('[data-back]')) {
        const prev = navHistory.pop();
        if (prev) openAsset(prev.tab, prev.id, { remember: false });
        return;
      }
      const copy = e.target.closest('[data-copy]');
      if (copy) return copyText(copy, copy.dataset.copy, 'copy');
      const share = e.target.closest('[data-share]');
      if (share) copyText(share, window.location.href, 'Copy link');
    });
    $('about-btn').addEventListener('click', () => $('about').showModal());
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('about').open) {
        e.preventDefault();
        $('search').focus();
      }
    });
    window.addEventListener('hashchange', () => {
      readHash();
      const id = state.selectedId;
      if (loaded && id && !data.tiered[state.tab].some((x) => x.id === id) && (data.untiered[state.tab] || []).some((x) => x.id === id)) {
        state.showUntiered = true;
      }
      render();
    });
  }

  async function main() {
    readHash();
    wire();
    render();
    try {
      await loadAll();
      refIndex = buildRefIndex();
      loaded = true;
      const id = state.selectedId;
      if (id && !data.tiered[state.tab].some((x) => x.id === id) && (data.untiered[state.tab] || []).some((x) => x.id === id)) {
        state.showUntiered = true;
      }
      setSync('ok', 'live data');
      $('sync-status').title = 'Loaded from github.com/emiliensocchi/azure-tiering';
    } catch (err) {
      loadError = `Could not load tiering data: ${err.message}`;
      setSync('err', 'offline');
    }
    render();
    if (state.selectedId) focusDetail();
  }

  document.addEventListener('DOMContentLoaded', main);
})();
