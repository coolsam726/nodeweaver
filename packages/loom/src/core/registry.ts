import {
  compareNavigationItems,
  groupIcon,
  indexNavigationConfig,
  type NavigationGroup,
} from './menu.js';
import type { LoomAuthUser } from './auth.js';
import type { LoomNavigationOptions, ResourceClass, ResourceMeta } from './types.js';

export class ResourceRegistry {
  private readonly resources = new Map<string, ResourceMeta>();
  private readonly classes = new Map<string, ResourceClass>();

  constructor(resourceClasses: ResourceClass[]) {
    for (const resourceClass of resourceClasses) {
      const meta = resourceClass.configure();
      if (this.resources.has(meta.slug)) {
        throw new Error(`Duplicate Loom resource slug: ${meta.slug}`);
      }
      this.resources.set(meta.slug, meta);
      this.classes.set(meta.slug, resourceClass);
    }
  }

  all(): ResourceMeta[] {
    return [...this.resources.values()];
  }

  resourceClass(slug: string): ResourceClass | undefined {
    return this.classes.get(slug);
  }

  requireClass(slug: string): ResourceClass {
    const resourceClass = this.resourceClass(slug);
    if (!resourceClass) {
      throw new Error(`Unknown Loom resource: ${slug}`);
    }
    return resourceClass;
  }

  navigationGroups(
    user?: LoomAuthUser | null,
    navigation?: LoomNavigationOptions,
  ): NavigationGroup[] {
    const { primary } = indexNavigationConfig(navigation);
    const groups = new Map<string, ResourceMeta[]>();

    for (const meta of this.all()) {
      if (user) {
        const resourceClass = this.classes.get(meta.slug);
        const allowed = resourceClass?.canAccess?.(user) ?? resourceClass?.canViewAny?.(user) ?? true;
        if (!allowed) continue;
      }
      const group = meta.navigationGroup ?? 'General';
      const items = groups.get(group) ?? [];
      items.push(meta);
      groups.set(group, items);
    }

    return [...groups.entries()]
      .map(([name, items]) => {
        const config = primary.get(name);
        return {
          name,
          icon: config?.icon ?? groupIcon(name, items.find((item) => item.icon)?.icon),
          sort: config?.sort,
          items: items.sort(compareNavigationItems),
        };
      })
      .sort((a, b) => {
        const sortA = a.sort ?? Number.POSITIVE_INFINITY;
        const sortB = b.sort ?? Number.POSITIVE_INFINITY;
        if (sortA !== sortB) return sortA - sortB;
        return a.name.localeCompare(b.name);
      });
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
