(function () {
  const FLASH_MESSAGES = {
    created: 'Record created.',
    updated: 'Record updated.',
    deleted: 'Record deleted.',
  };

  function listViewKey(slug) {
    return `velm-list-view:${slug}`;
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

  function resolveFlashMessage(value) {
    return FLASH_MESSAGES[value] ?? decodeURIComponent(value);
  }

  function showToast(type, message, durationMs) {
    const stack = document.getElementById('velm-toast-stack');
    if (!stack) return;

    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.className =
      'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg transition ' +
      (type === 'success'
        ? 'border-default bg-success-soft text-success-strong'
        : 'border-default bg-danger-soft text-fg-danger');

    toast.innerHTML = `
      <p class="flex-1">${message}</p>
      <button type="button" class="opacity-70 hover:opacity-100" aria-label="Dismiss">×</button>
    `;

    const dismiss = () => {
      toast.classList.add('opacity-0', 'translate-x-2');
      setTimeout(() => toast.remove(), 180);
    };

    toast.querySelector('button')?.addEventListener('click', dismiss);
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('opacity-0', 'translate-x-2'));
    setTimeout(dismiss, durationMs ?? 4200);
  }

  function consumeQueryFlash() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    if (!success && !error) return;

    showToast(success ? 'success' : 'error', resolveFlashMessage(success || error || ''));

    params.delete('success');
    params.delete('error');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }

  function maybeRedirectToStoredListView() {
    const root = document.querySelector('[data-velm-list-root]');
    if (!root) return;

    const slug = root.dataset.velmListRoot;
    const basePath = root.dataset.velmBasePath;
    const currentView = root.dataset.velmCurrentView;
    const hasKanban = root.dataset.velmHasKanban === 'true';
    if (!slug || !basePath || !hasKanban) return;

    const preferred = getStoredListView(slug);
    if (preferred === currentView) return;

    const params = window.location.search;
    window.location.replace(listPath(basePath, slug, preferred) + params);
  }

  function applyListHrefs() {
    const basePath = document.body.dataset.velmBasePath;
    if (!basePath) return;

    document.querySelectorAll('[data-velm-list-href]').forEach((el) => {
      const slug = el.getAttribute('data-velm-list-href');
      if (!slug || !(el instanceof HTMLAnchorElement)) return;
      el.href = listPath(basePath, slug, getStoredListView(slug));
    });
  }

  function bindListViewSwitcher() {
    document.querySelectorAll('[data-velm-list-view]').forEach((el) => {
      el.addEventListener('click', () => {
        const slug = el.getAttribute('data-velm-list-view-slug');
        const view = el.getAttribute('data-velm-list-view');
        if (slug && view) setStoredListView(slug, view);
      });
    });
  }

  window.VelmUI = {
    showToast,
    getStoredListView,
    setStoredListView,
    listPath,
    resolveFlashMessage,
  };

  document.addEventListener('alpine:init', () => {
    Alpine.data('velmDialogHost', () => ({
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
        this.open = true;
        this.loading = true;
        this.title = detail.title || 'Record';
        this.fullPageUrl = detail.url;
        this.resourceSlug = detail.slug || '';
        this.fullscreen = false;
        this.x = 0;
        this.y = 0;
        document.body.classList.add('overflow-hidden');

        const embedUrl = detail.url.includes('?') ? `${detail.url}&embed=1` : `${detail.url}?embed=1`;
        await this.$nextTick();
        try {
          const res = await fetch(embedUrl);
          const html = await res.text();
          if (this.$refs.body) {
            this.$refs.body.innerHTML = html;
            this.bindForm(this.$refs.body);
          }
        } finally {
          this.loading = false;
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
        const form = root.querySelector('form[data-velm-embed-form]');
        if (!form) return;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const res = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            redirect: 'manual',
          });
          if (res.status === 301 || res.status === 302) {
            this.handleRedirect(res.headers.get('Location'));
          }
        });
      },

      handleRedirect(location) {
        if (!location) return;
        const url = new URL(location, window.location.origin);
        const success = url.searchParams.get('success');
        const error = url.searchParams.get('error');
        this.close();

        if (success || error) {
          showToast(success ? 'success' : 'error', resolveFlashMessage(success || error || ''));
        }

        const basePath = document.body.dataset.velmBasePath || '';
        const slug = this.resourceSlug || url.pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        if (slug) {
          window.location.assign(listPath(basePath, slug, getStoredListView(slug)));
          return;
        }
        window.location.assign(url.pathname + url.search);
      },

      submitConfirm() {
        if (!this.confirmAction) return;
        const form = document.createElement('form');
        form.method = 'post';
        form.action = this.confirmAction;
        document.body.appendChild(form);
        form.submit();
      },
    }));
  });

  document.addEventListener('DOMContentLoaded', () => {
    consumeQueryFlash();
    maybeRedirectToStoredListView();
    applyListHrefs();
    bindListViewSwitcher();

    const flash = document.getElementById('velm-initial-flash');
    if (flash) {
      try {
        const data = JSON.parse(flash.textContent || 'null');
        if (data?.message) {
          showToast(data.type === 'error' ? 'error' : 'success', data.message);
        }
      } catch {
        /* ignore */
      }
      flash.remove();
    }
  });
})();
