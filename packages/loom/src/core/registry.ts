import { groupIcon } from './menu.js';
import type { ResourceClass, ResourceMeta } from './types.js';

export class ResourceRegistry {
  private readonly resources = new Map<string, ResourceMeta>();

  constructor(resourceClasses: ResourceClass[]) {
    for (const resourceClass of resourceClasses) {
      const meta = resourceClass.configure();
      if (this.resources.has(meta.slug)) {
        throw new Error(`Duplicate Loom resource slug: ${meta.slug}`);
      }
      this.resources.set(meta.slug, meta);
    }
  }

  all(): ResourceMeta[] {
    return [...this.resources.values()];
  }

  navigationGroups(): Array<{ name: string; icon?: string; items: ResourceMeta[] }> {
    const groups = new Map<string, ResourceMeta[]>();
    for (const meta of this.all()) {
      const group = meta.navigationGroup ?? 'General';
      const items = groups.get(group) ?? [];
      items.push(meta);
      groups.set(group, items);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, items]) => ({
        name,
        icon: groupIcon(name, items.find((item) => item.icon)?.icon),
        items: items.sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }

  get(slug: string): ResourceMeta | undefined {
    return this.resources.get(slug);
  }

  require(slug: string): ResourceMeta {
    const meta = this.get(slug);
    if (!meta) {
      throw new Error(`Unknown Loom resource: ${slug}`);
    }
    return meta;
  }
}
