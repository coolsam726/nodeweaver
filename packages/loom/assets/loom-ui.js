(function () {
  const FLASH_MESSAGES = {
    created: {
      type: 'success',
      title: 'Created',
      message: 'The record was saved successfully.',
    },
    updated: {
      type: 'success',
      title: 'Updated',
      message: 'Your changes have been saved.',
    },
    deleted: {
      type: 'success',
      title: 'Deleted',
      message: 'The record was removed.',
    },
  };

  const TOAST_ICONS = {
    success:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5"/></svg>',
    error:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4m0-4h.01M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10Z"/></svg>',
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  }

  function csrfHeaders(extra) {
    const headers = { ...(extra || {}) };
    const token = csrfToken();
    if (token) headers['X-CSRF-Token'] = token;
    return headers;
  }

  function normalizeToast(typeOrOptions, messageOrDuration, durationMs) {
    if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
      const options = typeOrOptions;
      return {
        type: options.type || 'success',
        title: options.title || defaultTitleForType(options.type || 'success'),
        message: options.message ?? options.body ?? '',
        durationMs: options.durationMs ?? 4200,
      };
    }

    const type = typeOrOptions || 'success';
    let title = defaultTitleForType(type);
    let message = '';
    let duration = durationMs ?? 4200;

    if (typeof messageOrDuration === 'object' && messageOrDuration !== null) {
      title = messageOrDuration.title || title;
      message = messageOrDuration.message ?? messageOrDuration.body ?? '';
      duration = messageOrDuration.durationMs ?? duration;
    } else if (typeof messageOrDuration === 'number') {
      duration = messageOrDuration;
    } else if (typeof messageOrDuration === 'string') {
      message = messageOrDuration;
    }

    return { type, title, message, durationMs: duration };
  }

  function defaultTitleForType(type) {
    switch (type) {
      case 'error':
        return 'Something went wrong';
      case 'warning':
        return 'Warning';
      case 'info':
        return 'Notice';
      default:
        return 'Success';
    }
  }

  function resolveFlashMessage(value, type) {
    const preset = FLASH_MESSAGES[value];
    if (preset) return preset;

    const decoded = decodeURIComponent(value);
    if (type === 'error') {
      return {
        type: 'error',
        title: 'Something went wrong',
        message: decoded,
      };
    }
    return {
      type: 'success',
      title: 'Success',
      message: decoded,
    };
  }

  function showToast(typeOrOptions, messageOrDuration, durationMs) {
    const stack = document.getElementById('loom-toast-stack');
    if (!stack) return;

    const toastData = normalizeToast(typeOrOptions, messageOrDuration, durationMs);
    const type = toastData.type;
    const title = toastData.title || defaultTitleForType(type);
    const message = toastData.message || '';
    const icon = TOAST_ICONS[type] || TOAST_ICONS.info;

    const toast = document.createElement('div');
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.className = `loom-toast loom-toast--${type}`;

    const bodyMarkup = message
      ? `<p class="loom-toast__body">${escapeHtml(message)}</p>`
      : '';

    toast.innerHTML = `
      <div class="loom-toast__icon">${icon}</div>
      <div class="loom-toast__content">
        <p class="loom-toast__title">${escapeHtml(title)}</p>
        ${bodyMarkup}
      </div>
      <button type="button" class="loom-toast__dismiss" aria-label="Dismiss">×</button>
    `;

    const dismiss = () => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector('.loom-toast__dismiss')?.addEventListener('click', dismiss);
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(dismiss, toastData.durationMs ?? 4200);
  }

  function listViewKey(slug) {
    return `loom-list-view:${slug}`;
  }

  function getStoredListView(slug) {
    const stored = localStorage.getItem(listViewKey(slug));
    return stored === 'kanban' ? 'kanban' : 'table';
  }

  function setStoredListView(slug, view) {
    localStorage.setItem(listViewKey(slug), view);
  }

  function listPath(basePath, slug, view) {
    return view === 'kanban' ? `${basePath}/${slug}/kanban` : `${basePath}/${slug}`;
  }

  function resourceSlugFromUrl(basePath, pathname) {
    const baseSegments = basePath.split('/').filter(Boolean);
    const pathSegments = pathname.split('/').filter(Boolean);
    if (pathSegments.length <= baseSegments.length) return '';
    return pathSegments[baseSegments.length] ?? '';
  }

  function clearFlashQueryParams() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('success') && !params.has('error')) return;

    params.delete('success');
    params.delete('error');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }

  function consumeQueryFlash() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    if (!success && !error) return false;

    const flash = resolveFlashMessage(success || error || '', success ? 'success' : 'error');
    showToast(flash);
    clearFlashQueryParams();
    return true;
  }

  function consumeInitialFlash() {
    const flash = document.getElementById('loom-initial-flash');
    if (!flash) return false;

    try {
      const data = JSON.parse(flash.textContent || 'null');
      if (data?.title || data?.message) {
        showToast(data);
      }
    } catch {
      /* ignore */
    }
    flash.remove();
    clearFlashQueryParams();
    return true;
  }

  function maybeRedirectToStoredListView() {
    const root = document.querySelector('[data-loom-list-root]');
    if (!root) return;

    const slug = root.dataset.loomListRoot;
    const basePath = root.dataset.loomBasePath;
    const currentView = root.dataset.loomCurrentView;
    const hasKanban = root.dataset.loomHasKanban === 'true';
    if (!slug || !basePath || !hasKanban) return;

    const preferred = getStoredListView(slug);
    if (preferred === currentView) return;

    const params = window.location.search;
    window.location.replace(listPath(basePath, slug, preferred) + params);
  }

  function applyListHrefs() {
    const basePath = document.body.dataset.loomBasePath;
    if (!basePath) return;

    document.querySelectorAll('[data-loom-list-href]').forEach((el) => {
      const slug = el.getAttribute('data-loom-list-href');
      if (!slug || !(el instanceof HTMLAnchorElement)) return;
      el.href = listPath(basePath, slug, getStoredListView(slug));
    });
  }

  function bindListViewSwitcher() {
    document.querySelectorAll('[data-loom-list-view]').forEach((el) => {
      el.addEventListener('click', () => {
        const slug = el.getAttribute('data-loom-list-view-slug');
        const view = el.getAttribute('data-loom-list-view');
        if (slug && view) setStoredListView(slug, view);
      });
    });
  }

  /** Auto-refresh interval while the list refresh control is armed. */
  const AUTO_REFRESH_MS = 10 * 1000; // 10 seconds
  const AUTO_REFRESH_CLICK_MS = 300;
  let _listAutoRefreshTimer = null;
  let _listRefreshClickTimer = null;
  let _listRefreshLastClick = 0;
  let _listRefreshBusy = false;

  function listAutoRefreshKey(slug) {
    return `loom-list-autorefresh:${slug}`;
  }

  function isListAutoRefreshEnabled(slug) {
    return sessionStorage.getItem(listAutoRefreshKey(slug)) === '1';
  }

  function setListAutoRefreshEnabled(slug, enabled) {
    if (enabled) {
      sessionStorage.setItem(listAutoRefreshKey(slug), '1');
    } else {
      sessionStorage.removeItem(listAutoRefreshKey(slug));
    }
  }

  function setListRefreshBusy(button, busy) {
    _listRefreshBusy = busy;
    const target = button || document.querySelector('[data-loom-list-refresh]');
    if (!target) return;
    target.disabled = busy;
    target.setAttribute('aria-busy', busy ? 'true' : 'false');
    target.classList.toggle('is-busy', busy);
  }

  function refreshListPage(button) {
    if (_listRefreshBusy) return false;
    setListRefreshBusy(button, true);
    window.location.reload();
    return true;
  }

  function stopListAutoRefresh() {
    if (_listAutoRefreshTimer) {
      clearInterval(_listAutoRefreshTimer);
      _listAutoRefreshTimer = null;
    }
  }

  function startListAutoRefresh(button) {
    stopListAutoRefresh();
    _listAutoRefreshTimer = window.setInterval(() => {
      refreshListPage(button);
    }, AUTO_REFRESH_MS);
  }

  function syncListRefreshButton(button, enabled) {
    if (!button) return;
    button.classList.toggle('is-auto', enabled);
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.title = enabled
      ? 'Auto-refresh on (every 10s) — click to turn off'
      : 'Refresh (double-click for auto-refresh every 10s)';
  }

  function bindListRefresh() {
    const root = document.querySelector('[data-loom-list-root]');
    const button = document.querySelector('[data-loom-list-refresh]');
    if (!root || !button) return;

    const slug = root.dataset.loomListRoot;
    if (!slug) return;

    setListRefreshBusy(button, false);

    const enabled = isListAutoRefreshEnabled(slug);
    syncListRefreshButton(button, enabled);
    if (enabled) {
      startListAutoRefresh(button);
    }

    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (_listRefreshBusy || button.disabled) return;

      const now = Date.now();
      const isDoubleClick = now - _listRefreshLastClick < AUTO_REFRESH_CLICK_MS;
      _listRefreshLastClick = now;

      if (_listRefreshClickTimer) {
        clearTimeout(_listRefreshClickTimer);
        _listRefreshClickTimer = null;
      }

      if (isDoubleClick) {
        const next = !isListAutoRefreshEnabled(slug);
        setListAutoRefreshEnabled(slug, next);
        syncListRefreshButton(button, next);
        if (next) {
          startListAutoRefresh(button);
          showToast('info', {
            title: 'Auto-refresh on',
            message: 'This list will refresh every 10 seconds.',
          });
        } else {
          stopListAutoRefresh();
          showToast('info', {
            title: 'Auto-refresh off',
            message: 'Automatic refresh has been stopped.',
          });
        }
        return;
      }

      _listRefreshClickTimer = window.setTimeout(() => {
        _listRefreshClickTimer = null;
        if (_listRefreshBusy || button.disabled) return;
        if (isListAutoRefreshEnabled(slug)) {
          setListAutoRefreshEnabled(slug, false);
          stopListAutoRefresh();
          syncListRefreshButton(button, false);
          showToast('info', {
            title: 'Auto-refresh off',
            message: 'Automatic refresh has been stopped.',
          });
          return;
        }
        refreshListPage(button);
      }, AUTO_REFRESH_CLICK_MS);
    });
  }

  window.LoomUI = {
    showToast,
    getStoredListView,
    setStoredListView,
    listPath,
    resolveFlashMessage,
    openDialog(detail) {
      _dialogOnResult = typeof detail.onResult === 'function' ? detail.onResult : null;
      window.dispatchEvent(new CustomEvent('loom-open-dialog', { detail }));
    },
  };

  let _dialogOnResult = null;
  let _pendingRelationPick = null;

  function applyPendingRelationPick() {
    if (!_pendingRelationPick) return;
    const detail = _pendingRelationPick;
    _pendingRelationPick = null;
    const eventName = detail.mode === 'm2m' ? 'loom-m2m-pick' : 'loom-m2o-pick';
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  function withEmbed(url) {
    const next = new URL(url, window.location.origin);
    next.searchParams.set('embed', '1');
    return `${next.pathname}${next.search}`;
  }

  function withoutEmbed(url) {
    const next = new URL(url, window.location.origin);
    next.searchParams.delete('embed');
    const query = next.searchParams.toString();
    return `${next.pathname}${query ? `?${query}` : ''}`;
  }

  function parseAdminRecordPath(pathname) {
    const basePath = document.body.dataset.loomBasePath || '';
    const baseSegments = basePath.split('/').filter(Boolean);
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length < baseSegments.length + 2) return null;
    for (let index = 0; index < baseSegments.length; index += 1) {
      if (segments[index] !== baseSegments[index]) return null;
    }
    const slug = segments[baseSegments.length];
    const id = segments[baseSegments.length + 1];
    if (!slug || !id) return null;
    if (['create', 'edit', 'relation-search', 'relation-quick-create', 'kanban'].includes(id)) {
      return null;
    }
    if (id === 'summary') return null;
    return { slug, id };
  }

  function flashFromRedirect(success, error) {
    if (success) return resolveFlashMessage(success, 'success');
    if (error) {
      return {
        type: 'error',
        title: 'Something went wrong',
        message: decodeURIComponent(error),
      };
    }
    return null;
  }

  document.addEventListener('alpine:init', () => {
    registerLoomAlpineComponents();
  });

  if (window.Alpine) {
    registerLoomAlpineComponents();
  }

  function readM2oConfig(el) {
    const raw = el?.getAttribute?.('data-loom-m2o-config');
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function readM2mConfig(el) {
    const raw = el?.getAttribute?.('data-loom-m2m-config');
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function createLoomM2o(cfg) {
    return {
      name: cfg.name,
      relatedResource: cfg.relatedResource,
      singularLabel: cfg.singularLabel || 'Record',
      searchUrl: cfg.searchUrl,
      quickCreateUrl: cfg.quickCreateUrl,
      createUrl: cfg.createUrl,
      detailUrlBase: cfg.detailUrlBase,
      readonly: !!cfg.readonly,
      required: !!cfg.required,

      value: cfg.initialId != null && cfg.initialId !== '' ? String(cfg.initialId) : null,
      label: cfg.initialLabel || '',
      query: '',
      results: [],
      cursor: 0,
      open: false,
      loading: false,
      _abort: null,
      _initialFetched: false,

      init() {
        this.query = this.label;
        this._pickHandler = (event) => {
          const detail = event.detail || {};
          if (detail.field === this.name) {
            this.pick({ id: detail.id, label: detail.label });
          }
        };
        window.addEventListener('loom-m2o-pick', this._pickHandler);
      },

      destroy() {
        if (this._pickHandler) {
          window.removeEventListener('loom-m2o-pick', this._pickHandler);
        }
      },

      get exactMatch() {
        const q = this.query.trim().toLowerCase();
        if (!q) return null;
        return this.results.find((item) => item.label.toLowerCase() === q) || null;
      },

      get createCandidate() {
        if (this.readonly) return false;
        const q = this.query.trim();
        return q.length > 0 && !this.exactMatch;
      },

      get canCreateAndEdit() {
        return !this.readonly && !!this.createUrl;
      },

      async fetchResults() {
        if (this._abort) this._abort.abort();
        const ctl = new AbortController();
        this._abort = ctl;
        this.loading = true;
        try {
          const url = `${this.searchUrl}&q=${encodeURIComponent(this.query)}`;
          const response = await fetch(url, { signal: ctl.signal });
          if (!response.ok) throw new Error('fetch failed');
          const data = await response.json();
          this.results = data.results || [];
          this.cursor = 0;
        } catch (error) {
          if (error.name !== 'AbortError') {
            this.results = [];
          }
        } finally {
          this.loading = false;
        }
      },

      onFocus() {
        this.open = true;
        if (!this._initialFetched) {
          this._initialFetched = true;
          this.fetchResults();
        }
      },

      onInput() {
        this.open = true;
        if (this.query !== this.label) {
          this.value = null;
          this.label = '';
        }
        this.fetchResults();
      },

      close() {
        this.open = false;
        this.query = this.label;
      },

      moveCursor(delta) {
        if (!this.open) {
          this.open = true;
          return;
        }
        const extra = this.createCandidate ? 1 : 0;
        const max = this.results.length + extra - 1;
        if (max < 0) return;
        this.cursor = Math.max(0, Math.min(max, this.cursor + delta));
      },

      onEnter() {
        if (!this.open) return;
        if (this.cursor < this.results.length) {
          this.pick(this.results[this.cursor]);
        } else if (this.createCandidate) {
          this.createFromQuery();
        }
      },

      pick(item) {
        this.value = item.id != null ? String(item.id) : null;
        this.label = item.label || '';
        this.query = this.label;
        this.open = false;
      },

      clearSelection() {
        this.value = null;
        this.label = '';
        this.query = '';
        this.cursor = 0;
        this.open = false;
        this.$refs.input?.focus();
      },

      openRecord() {
        if (!this.value || !this.detailUrlBase) return;
        window.LoomUI.openDialog({
          url: `${this.detailUrlBase}/${this.value}/edit`,
          title: this.label || 'Edit record',
          slug: this.relatedResource,
        });
      },

      async createFromQuery() {
        const name = this.query.trim();
        if (!name) return;
        try {
          const response = await fetch(this.quickCreateUrl, {
            method: 'POST',
            headers: csrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ field: this.name, name }),
          });
          if (response.status === 400) {
            if (this.canCreateAndEdit) {
              this.createAndEdit();
              return;
            }
            const body = await response.json().catch(() => ({}));
            showToast('error', {
              title: 'Create blocked',
              message: body.message || body.detail || 'Cannot create this record inline.',
            });
            return;
          }
          if (!response.ok) throw new Error('create failed');
          const item = await response.json();
          this.results = [item, ...this.results.filter((entry) => String(entry.id) !== String(item.id))];
          this.pick(item);
        } catch {
          showToast('error', {
            title: 'Error',
            message: 'Unable to create record.',
          });
        }
      },

      createAndEdit() {
        if (!this.createUrl) return;
        this.open = false;
        const q = (this.query || '').trim();
        const url = q
          ? `${this.createUrl}?name=${encodeURIComponent(q)}`
          : this.createUrl;
        const title = q ? `New ${this.singularLabel}` : `Create ${this.singularLabel}`;
        window.LoomUI.openDialog({
          url,
          title,
          slug: this.relatedResource,
          onResult: (result) => {
            if (result?.id) {
              _pendingRelationPick = {
                mode: 'm2o',
                field: this.name,
                id: result.id,
                label: result.label,
              };
            }
          },
        });
      },
    };
  }

  function createLoomM2m(cfg) {
    return {
      name: cfg.name,
      relatedResource: cfg.relatedResource,
      singularLabel: cfg.singularLabel || 'Record',
      searchUrl: cfg.searchUrl,
      quickCreateUrl: cfg.quickCreateUrl,
      createUrl: cfg.createUrl,
      detailUrlBase: cfg.detailUrlBase,
      readonly: !!cfg.readonly,
      required: !!cfg.required,

      selected: Array.isArray(cfg.initialItems)
        ? cfg.initialItems.map((item) => ({
            id: String(item.id),
            label: item.label || String(item.id),
          }))
        : [],
      query: '',
      results: [],
      cursor: 0,
      open: false,
      loading: false,
      _abort: null,
      _initialFetched: false,

      init() {
        this._pickHandler = (event) => {
          const detail = event.detail || {};
          if (detail.field === this.name) {
            this.pick({ id: detail.id, label: detail.label });
          }
        };
        window.addEventListener('loom-m2m-pick', this._pickHandler);
      },

      destroy() {
        if (this._pickHandler) {
          window.removeEventListener('loom-m2m-pick', this._pickHandler);
        }
      },

      get valueCsv() {
        return this.selected.map((item) => item.id).join(',');
      },

      get selectedIds() {
        return new Set(this.selected.map((item) => String(item.id)));
      },

      get availableResults() {
        const selected = this.selectedIds;
        return this.results.filter((item) => !selected.has(String(item.id)));
      },

      get exactMatch() {
        const q = this.query.trim().toLowerCase();
        if (!q) return null;
        return this.availableResults.find((item) => item.label.toLowerCase() === q) || null;
      },

      get createCandidate() {
        if (this.readonly) return false;
        const q = this.query.trim();
        return q.length > 0 && !this.exactMatch;
      },

      get canCreateAndEdit() {
        return !this.readonly && !!this.createUrl;
      },

      focusInput() {
        if (this.readonly) return;
        this.$refs.input?.focus();
        this.onFocus();
      },

      async fetchResults() {
        if (this._abort) this._abort.abort();
        const ctl = new AbortController();
        this._abort = ctl;
        this.loading = true;
        try {
          const url = `${this.searchUrl}&q=${encodeURIComponent(this.query)}`;
          const response = await fetch(url, { signal: ctl.signal });
          if (!response.ok) throw new Error('fetch failed');
          const data = await response.json();
          this.results = data.results || [];
          this.cursor = 0;
        } catch (error) {
          if (error.name !== 'AbortError') {
            this.results = [];
          }
        } finally {
          this.loading = false;
        }
      },

      onFocus() {
        if (this.readonly) return;
        this.open = true;
        if (!this._initialFetched) {
          this._initialFetched = true;
          this.fetchResults();
        }
      },

      onInput() {
        this.open = true;
        this.fetchResults();
      },

      close() {
        this.open = false;
        this.query = '';
      },

      moveCursor(delta) {
        if (!this.open) {
          this.open = true;
          return;
        }
        const extra = this.createCandidate ? 1 : 0;
        const max = this.availableResults.length + extra - 1;
        if (max < 0) return;
        this.cursor = Math.max(0, Math.min(max, this.cursor + delta));
      },

      onEnter() {
        if (!this.open) return;
        if (this.cursor < this.availableResults.length) {
          this.pick(this.availableResults[this.cursor]);
        } else if (this.createCandidate) {
          this.createFromQuery();
        }
      },

      onBackspace() {
        if (this.query || this.readonly || this.selected.length === 0) return;
        this.remove(this.selected[this.selected.length - 1].id);
      },

      pick(item) {
        if (!item || item.id == null) return;
        const id = String(item.id);
        if (this.selectedIds.has(id)) return;
        this.selected = [...this.selected, { id, label: item.label || id }];
        this.query = '';
        this.cursor = 0;
        this.fetchResults();
        this.$nextTick?.(() => this.$refs.input?.focus());
      },

      remove(id) {
        const target = String(id);
        this.selected = this.selected.filter((item) => String(item.id) !== target);
      },

      openRecord(item) {
        if (!item?.id || !this.detailUrlBase) return;
        window.LoomUI.openDialog({
          url: `${this.detailUrlBase}/${item.id}/edit`,
          title: item.label || 'Edit record',
          slug: this.relatedResource,
        });
      },

      async createFromQuery() {
        const name = this.query.trim();
        if (!name) return;
        try {
          const response = await fetch(this.quickCreateUrl, {
            method: 'POST',
            headers: csrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ field: this.name, name }),
          });
          if (response.status === 400) {
            if (this.canCreateAndEdit) {
              this.createAndEdit();
              return;
            }
            const body = await response.json().catch(() => ({}));
            showToast('error', {
              title: 'Create blocked',
              message: body.message || body.detail || 'Cannot create this record inline.',
            });
            return;
          }
          if (!response.ok) throw new Error('create failed');
          const item = await response.json();
          this.results = [item, ...this.results.filter((entry) => String(entry.id) !== String(item.id))];
          this.pick(item);
        } catch {
          showToast('error', {
            title: 'Error',
            message: 'Unable to create record.',
          });
        }
      },

      createAndEdit() {
        if (!this.createUrl) return;
        this.open = false;
        const q = (this.query || '').trim();
        const url = q
          ? `${this.createUrl}?name=${encodeURIComponent(q)}`
          : this.createUrl;
        const title = q ? `New ${this.singularLabel}` : `Create ${this.singularLabel}`;
        window.LoomUI.openDialog({
          url,
          title,
          slug: this.relatedResource,
          onResult: (result) => {
            if (result?.id) {
              _pendingRelationPick = {
                mode: 'm2m',
                field: this.name,
                id: result.id,
                label: result.label,
              };
            }
          },
        });
      },
    };
  }

  function createLoomM2mCheckbox(cfg) {
    const self = createLoomM2m(cfg);
    self.filter = '';
    self.columns = Math.min(4, Math.max(1, Number(cfg.checkboxColumns) || 1));
    self.cascadeWildcards = cfg.cascadeWildcards !== false;
    self.groupBy = cfg.groupBy ? String(cfg.groupBy) : '';
    self.framed = cfg.checkboxFramed !== false;
    self.options = Array.isArray(cfg.options)
      ? cfg.options.map((item) => normalizeCheckboxOption(item))
      : [];
    const prevInit = self.init;
    self.init = function initCheckbox() {
      prevInit.call(this);
      if (this.options.length === 0) {
        this.loadAllOptions();
      } else {
        this.sortOptions();
        this.mergeSelectedIntoOptions();
        this.pruneCovered();
      }
    };
    Object.defineProperty(self, 'filteredOptions', {
      configurable: true,
      enumerable: true,
      get() {
        const q = this.filter.trim().toLowerCase();
        if (!q) return this.options;
        return this.options.filter((item) => {
          const hay = `${item.label} ${item.ability || ''} ${item.group || ''}`.toLowerCase();
          return hay.includes(q);
        });
      },
    });
    Object.defineProperty(self, 'filteredGroups', {
      configurable: true,
      enumerable: true,
      get() {
        const items = this.filteredOptions;
        if (!this.groupBy) {
          return items.length
            ? [{ key: '_all', title: 'All', items }]
            : [];
        }
        const map = new Map();
        for (const item of items) {
          const key = item.group || deriveGroupFromLabel(item.label) || '_other';
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(item);
        }
        const keys = [...map.keys()].sort((a, b) => {
          if (a === '*') return -1;
          if (b === '*') return 1;
          if (a === '_other') return 1;
          if (b === '_other') return -1;
          return a.localeCompare(b);
        });
        return keys.map((key) => ({
          key,
          title: groupTitle(key),
          items: sortGroupItems(map.get(key), this),
        }));
      },
    });
    self.permissionKey = function permissionKey(item) {
      return String(item?.label || item?.id || '').trim();
    };
    self.itemDisplay = function itemDisplay(item) {
      if (item?.ability) {
        return item.ability === '*' ? 'All (*)' : item.ability;
      }
      const key = this.permissionKey(item);
      if (key === '*') return 'All (*)';
      if (key.includes(':')) {
        const ability = key.slice(key.indexOf(':') + 1);
        return ability === '*' ? 'All (*)' : ability || key;
      }
      return item?.label || key;
    };
    self.groupSelectedCount = function groupSelectedCount(group) {
      if (!group?.items) return 0;
      return group.items.filter((item) => this.isSelected(item.id)).length;
    };
    self.covers = function covers(wildcard, candidate) {
      if (!wildcard || !candidate || wildcard === candidate) return false;
      if (wildcard === '*') return true;
      if (wildcard.endsWith(':*')) {
        const prefix = wildcard.slice(0, -1);
        return candidate.startsWith(prefix);
      }
      return false;
    };
    self.isCovered = function isCovered(item) {
      if (!this.cascadeWildcards || !item) return false;
      const key = this.permissionKey(item);
      for (const sel of this.selected) {
        if (String(sel.id) === String(item.id)) continue;
        if (this.covers(this.permissionKey(sel), key)) return true;
      }
      return false;
    };
    self.coveredHint = function coveredHint(item) {
      if (!item) return '';
      const key = this.permissionKey(item);
      for (const sel of this.selected) {
        const wild = this.permissionKey(sel);
        if (this.covers(wild, key)) {
          return `Covered by ${wild}`;
        }
      }
      return '';
    };
    self.pruneCovered = function pruneCovered() {
      if (!this.cascadeWildcards) return;
      this.selected = this.selected.filter((item) => !this.isCovered(item));
    };
    self.sortOptions = function sortOptions() {
      this.options = [...this.options].sort((a, b) => {
        const ag = a.group || deriveGroupFromLabel(a.label) || '';
        const bg = b.group || deriveGroupFromLabel(b.label) || '';
        if (ag === '*' && bg !== '*') return -1;
        if (bg === '*' && ag !== '*') return 1;
        if (ag !== bg) return ag.localeCompare(bg);
        return compareAbility(a, b, this);
      });
    };
    self.isSelected = function isSelected(id) {
      return this.selectedIds.has(String(id));
    };
    self.pick = function pickCheckbox(item) {
      if (!item || item.id == null || this.readonly) return;
      const id = String(item.id);
      if (this.selectedIds.has(id)) return;
      const next = normalizeCheckboxOption(item);
      this.selected = [...this.selected, next];
      this.pruneCovered();
    };
    self.toggle = function toggle(item) {
      if (this.readonly || !item) return;
      if (this.isCovered(item) && !this.isSelected(item.id)) return;
      if (this.isSelected(item.id)) {
        this.remove(item.id);
      } else {
        this.pick(item);
      }
    };
    self.mergeSelectedIntoOptions = function mergeSelectedIntoOptions() {
      const seen = new Set(this.options.map((item) => String(item.id)));
      for (const item of this.selected) {
        if (!seen.has(String(item.id))) {
          const enriched = normalizeCheckboxOption({
            ...item,
            group: item.group || deriveGroupFromLabel(item.label),
          });
          this.options = [enriched, ...this.options];
        }
      }
    };
    self.loadAllOptions = async function loadAllOptions() {
      this.loading = true;
      try {
        const url = `${this.searchUrl}&q=&limit=250`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('fetch failed');
        const data = await response.json();
        this.options = (data.results || []).map((item) => normalizeCheckboxOption(item));
        this.sortOptions();
        this.mergeSelectedIntoOptions();
        this.pruneCovered();
      } catch {
        this.options = this.selected.map((item) => normalizeCheckboxOption(item));
      } finally {
        this.loading = false;
      }
    };
    return self;
  }

  function normalizeCheckboxOption(item) {
    const id = String(item.id ?? item.value ?? '');
    const label = item.label || id;
    return {
      id,
      label,
      group: item.group || deriveGroupFromLabel(label),
      ability: item.ability || deriveAbilityFromLabel(label),
    };
  }

  function deriveGroupFromLabel(label) {
    const trimmed = String(label || '').trim();
    if (!trimmed || trimmed === '*') return '*';
    const colon = trimmed.indexOf(':');
    if (colon <= 0) return trimmed;
    return trimmed.slice(0, colon) || '*';
  }

  function deriveAbilityFromLabel(label) {
    const trimmed = String(label || '').trim();
    if (!trimmed || trimmed === '*') return '*';
    const colon = trimmed.indexOf(':');
    if (colon < 0) return undefined;
    return trimmed.slice(colon + 1) || undefined;
  }

  function groupTitle(key) {
    if (key === '*' || key === '_all') return 'Global';
    if (key === '_other') return 'Other';
    return String(key)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function compareAbility(a, b, ctx) {
    const aa = a.ability || deriveAbilityFromLabel(a.label) || ctx.permissionKey(a);
    const ba = b.ability || deriveAbilityFromLabel(b.label) || ctx.permissionKey(b);
    const aRank = aa === '*' ? 0 : 1;
    const bRank = ba === '*' ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    return String(aa).localeCompare(String(ba));
  }

  function sortGroupItems(items, ctx) {
    return [...items].sort((a, b) => compareAbility(a, b, ctx));
  }

  function createLoomM2mTable(cfg) {
    const self = createLoomM2m(cfg);
    self.addOpen = false;
    const prevInit = self.init;
    const prevDestroy = self.destroy;
    const prevPick = self.pick;
    const prevCreateAndEdit = self.createAndEdit;
    self.init = function initTable() {
      prevInit.call(this);
      this._tablePickHandler = (event) => {
        const detail = event.detail || {};
        if (detail.field === this.name) {
          prevPick.call(this, { id: detail.id, label: detail.label });
          this.closeAdd();
        }
      };
      window.addEventListener('loom-m2m-pick', this._tablePickHandler);
    };
    self.destroy = function destroyTable() {
      prevDestroy.call(this);
      if (this._tablePickHandler) {
        window.removeEventListener('loom-m2m-pick', this._tablePickHandler);
      }
    };
    self.toggleAdd = function toggleAdd() {
      this.addOpen = !this.addOpen;
      if (this.addOpen) {
        this.query = '';
        this.fetchResults();
        this.$nextTick?.(() => this.$refs.addInput?.focus());
      }
    };
    self.closeAdd = function closeAdd() {
      this.addOpen = false;
      this.query = '';
    };
    self.pick = function pickTable(item) {
      prevPick.call(this, item);
      this.closeAdd();
    };
    self.createAndEdit = function createAndEditTable() {
      this.closeAdd();
      prevCreateAndEdit.call(this);
    };
    return self;
  }

  function registerLoomAlpineComponents() {
    if (registerLoomAlpineComponents._done) return;
    registerLoomAlpineComponents._done = true;

    Alpine.data('loomM2oFromEl', (el) => createLoomM2o(readM2oConfig(el)));
    Alpine.data('loomM2o', (cfg) => createLoomM2o(cfg));
    Alpine.data('loomM2mFromEl', (el) => createLoomM2m(readM2mConfig(el)));
    Alpine.data('loomM2m', (cfg) => createLoomM2m(cfg));
    Alpine.data('loomM2mCheckboxFromEl', (el) => createLoomM2mCheckbox(readM2mConfig(el)));
    Alpine.data('loomM2mTableFromEl', (el) => createLoomM2mTable(readM2mConfig(el)));

    Alpine.data('loomDialogHost', () => ({
      open: false,
      loading: false,
      confirmMode: false,
      title: '',
      fullPageUrl: '',
      confirmAction: '',
      confirmMessage: '',
      fullscreen: false,
      x: 0,
      y: 0,
      width: 720,
      height: 520,
      minWidth: 400,
      minHeight: 280,
      dragging: false,
      resizing: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      resizeStartX: 0,
      resizeStartY: 0,
      resizeStartW: 0,
      resizeStartH: 0,
      resourceSlug: '',
      dialogStack: [],
      currentEmbedUrl: '',

      mountBody(html) {
        if (!this.$refs.body) return;
        this.$refs.body.innerHTML = html;
        if (typeof Alpine !== 'undefined' && Alpine.initTree) {
          Alpine.initTree(this.$refs.body);
        }
        this.bindForm(this.$refs.body);
      },
      init() {
        window.addEventListener('mousemove', (e) => {
          this.onDrag(e);
          this.onResize(e);
        });
        window.addEventListener('mouseup', () => {
          this.dragging = false;
          this.resizing = false;
        });
      },

      panelStyle() {
        if (this.fullscreen) {
          return 'inset: 0.75rem; width: auto; height: auto; transform: none;';
        }
        return `width: ${this.width}px; height: ${this.height}px; transform: translate(calc(-50% + ${this.x}px), calc(-50% + ${this.y}px));`;
      },

      async openModal(detail) {
        this.confirmMode = false;
        const nextSlug = detail.slug || '';
        const replace = detail.replace === true;
        const shouldStack =
          this.open &&
          !replace &&
          !this.confirmMode &&
          this.currentEmbedUrl &&
          nextSlug &&
          nextSlug !== this.resourceSlug;

        if (shouldStack) {
          this.dialogStack.push({
            title: this.title,
            fullPageUrl: this.fullPageUrl,
            resourceSlug: this.resourceSlug,
            url: this.currentEmbedUrl,
            onResult: _dialogOnResult,
          });
        } else if (!this.open) {
          document.body.classList.add('overflow-hidden');
        }
        this.open = true;
        this.loading = true;
        this.title = detail.title || 'Record';
        this.fullPageUrl = withoutEmbed(detail.url);
        this.resourceSlug = nextSlug;
        this.fullscreen = false;
        this.x = 0;
        this.y = 0;
        if (!replace) {
          _dialogOnResult = typeof detail.onResult === 'function' ? detail.onResult : null;
        }

        const embedUrl = withEmbed(detail.url);
        this.currentEmbedUrl = embedUrl;
        await this.$nextTick();
        try {
          const res = await fetch(embedUrl);
          const html = await res.text();
          this.mountBody(html);
        } finally {
          this.loading = false;
        }
      },

      async restoreDialog(stackItem) {
        this.title = stackItem.title;
        this.fullPageUrl = stackItem.fullPageUrl;
        this.resourceSlug = stackItem.resourceSlug;
        this.currentEmbedUrl = stackItem.url;
        _dialogOnResult = stackItem.onResult || null;
        this.loading = true;
        try {
          const res = await fetch(stackItem.url);
          this.mountBody(await res.text());
        } finally {
          this.loading = false;
          this.confirmMode = false;
        }
      },

      openConfirm(detail) {
        this.confirmMode = true;
        this.open = true;
        this.loading = false;
        this.title = detail.title || 'Confirm';
        this.confirmMessage = detail.message || 'Are you sure?';
        this.confirmAction = detail.action || '';
        this.fullPageUrl = '';
        this.fullscreen = false;
        this.x = 0;
        this.y = 0;
        document.body.classList.add('overflow-hidden');
      },

      close() {
        this.open = false;
        this.confirmMode = false;
        this.fullscreen = false;
        this.dialogStack = [];
        _dialogOnResult = null;
        this.currentEmbedUrl = '';
        if (this.$refs.body) {
          this.$refs.body.innerHTML = '';
        }
        document.body.classList.remove('overflow-hidden');
      },

      toggleFullscreen() {
        this.fullscreen = !this.fullscreen;
        if (this.fullscreen) {
          this.x = 0;
          this.y = 0;
        }
      },

      startDrag(event) {
        if (this.fullscreen || this.confirmMode) return;
        this.dragging = true;
        this.dragOffsetX = event.clientX - this.x;
        this.dragOffsetY = event.clientY - this.y;
      },

      onDrag(event) {
        if (!this.dragging) return;
        this.x = event.clientX - this.dragOffsetX;
        this.y = event.clientY - this.dragOffsetY;
      },

      startResize(event) {
        if (this.fullscreen || this.confirmMode) return;
        event.preventDefault();
        this.resizing = true;
        this.resizeStartX = event.clientX;
        this.resizeStartY = event.clientY;
        this.resizeStartW = this.width;
        this.resizeStartH = this.height;
      },

      onResize(event) {
        if (!this.resizing) return;
        this.width = Math.max(this.minWidth, this.resizeStartW + (event.clientX - this.resizeStartX));
        this.height = Math.max(this.minHeight, this.resizeStartH + (event.clientY - this.resizeStartY));
      },

      bindForm(root) {
        const form = root.querySelector('form[data-loom-embed-form]');
        if (!form) return;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const submitBtn = form.querySelector('[type="submit"]');
          if (submitBtn) submitBtn.disabled = true;
          try {
            const body = new URLSearchParams(new FormData(form));
            if (!body.has('_csrf')) {
              const token = csrfToken();
              if (token) body.set('_csrf', token);
            }
            const res = await fetch(form.action, {
              method: 'POST',
              headers: csrfHeaders({
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              }),
              body,
              redirect: 'follow',
            });
            if (res.redirected) {
              const done = new URL(res.url);
              this.handleRedirect(`${done.pathname}${done.search}`);
              return;
            }
            if (!res.ok) {
              showToast('error', {
                title: 'Could not save',
                message: 'Please check the form and try again.',
              });
            }
          } catch {
            showToast('error', {
              title: 'Could not save',
              message: 'Please check the form and try again.',
            });
          } finally {
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      },

      async handleRedirect(location) {
        if (!location) return;
        const url = new URL(location, window.location.origin);
        const success = url.searchParams.get('success');
        const error = url.searchParams.get('error');
        const isEmbed = url.searchParams.get('embed') === '1';
        const basePath = document.body.dataset.loomBasePath || '';
        const flash = flashFromRedirect(success, error);

        if (isEmbed && _dialogOnResult && success === 'created') {
          const record = parseAdminRecordPath(url.pathname);
          if (record) {
            try {
              const response = await fetch(`${basePath}/${record.slug}/${record.id}/summary`);
              if (response.ok) {
                const item = await response.json();
                const callback = _dialogOnResult;
                _dialogOnResult = null;
                if (callback) callback({ id: item.id, label: item.label });
                if (flash) showToast(flash);
                if (this.dialogStack.length > 0) {
                  await this.restoreDialog(this.dialogStack.pop());
                  applyPendingRelationPick();
                  return;
                }
                applyPendingRelationPick();
                this.close();
                return;
              }
            } catch {
              /* fall through */
            }
          }
          _dialogOnResult = null;
        }

        if (isEmbed && this.open) {
          if (success === 'updated' || (success === 'created' && !_dialogOnResult)) {
            // Nested M2O dialog (create/edit related record): restore the parent form.
            if (this.dialogStack.length > 0) {
              if (flash) showToast(flash);
              await this.restoreDialog(this.dialogStack.pop());
              return;
            }
            // Top-level create/edit: close and refresh the list.
            this.dialogStack = [];
            this.close();
            const record = parseAdminRecordPath(url.pathname);
            const slug =
              this.resourceSlug ||
              record?.slug ||
              resourceSlugFromUrl(basePath, url.pathname) ||
              '';
            if (slug) {
              const target = new URL(
                listPath(basePath, slug, getStoredListView(slug)),
                window.location.origin,
              );
              if (success) target.searchParams.set('success', success);
              if (error) target.searchParams.set('error', error);
              window.location.assign(`${target.pathname}${target.search}`);
              return;
            }
            if (flash) showToast(flash);
            window.location.reload();
            return;
          }

          if (error) {
            if (flash) showToast(flash);
            this.loading = true;
            try {
              const res = await fetch(url.pathname + url.search);
              this.mountBody(await res.text());
            } finally {
              this.loading = false;
            }
            return;
          }
        }

        // Non-embed success while a dialog is open (e.g. update redirected to list).
        if (this.open && (success === 'updated' || success === 'created') && !_dialogOnResult) {
          this.dialogStack = [];
          this.close();
          const record = parseAdminRecordPath(url.pathname);
          const slug =
            this.resourceSlug ||
            record?.slug ||
            resourceSlugFromUrl(basePath, url.pathname) ||
            '';
          if (slug) {
            const target = new URL(
              listPath(basePath, slug, getStoredListView(slug)),
              window.location.origin,
            );
            if (success) target.searchParams.set('success', success);
            if (error) target.searchParams.set('error', error);
            window.location.assign(`${target.pathname}${target.search}`);
            return;
          }
          if (flash) showToast(flash);
          window.location.reload();
          return;
        }

        if (this.dialogStack.length > 0) {
          await this.restoreDialog(this.dialogStack.pop());
          return;
        }

        this.close();

        const slug =
          this.resourceSlug ||
          parseAdminRecordPath(url.pathname)?.slug ||
          resourceSlugFromUrl(basePath, url.pathname) ||
          '';
        if (slug) {
          const target = new URL(
            listPath(basePath, slug, getStoredListView(slug)),
            window.location.origin,
          );
          if (success) target.searchParams.set('success', success);
          if (error) target.searchParams.set('error', error);
          window.location.assign(`${target.pathname}${target.search}`);
          return;
        }
        window.location.assign(url.pathname + url.search);
      },

      submitConfirm() {
        if (!this.confirmAction) return;
        const form = document.createElement('form');
        form.method = 'post';
        form.action = this.confirmAction;
        const token = csrfToken();
        if (token) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = '_csrf';
          input.value = token;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
      },
    }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!consumeInitialFlash()) {
      consumeQueryFlash();
    }
    maybeRedirectToStoredListView();
    applyListHrefs();
    bindListViewSwitcher();
    bindListRefresh();
  });
})();
