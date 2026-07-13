import type {
  LoomNavigationGroupConfig,
  LoomNavigationOptions,
  ResourceMeta,
} from './types.js';

export interface MenuRoot {
  label: string;
  icon: string;
  href: string;
  rootIndex: number;
  active: boolean;
}

export interface MenuSecondaryChild {
  label: string;
  href: string;
  active: boolean;
  icon?: string;
}

export interface MenuSecondaryItem {
  label: string;
  href?: string;
  active: boolean;
  icon?: string;
  children?: MenuSecondaryChild[];
}

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface MenuLayoutContext {
  menuRoots: MenuRoot[];
  menuActiveRoot: MenuRoot | null;
  menuActiveRootIndex: number | null;
  menuSecondary: MenuSecondaryItem[];
  breadcrumbs: Breadcrumb[];
}

const GROUP_ICONS: Record<string, string> = {
  Administration: 'cog',
  General: 'squares-2x2',
  CRM: 'users',
  Settings: 'cog',
};

export function groupIcon(name: string, fallback?: string): string {
  return GROUP_ICONS[name] ?? fallback ?? 'squares-2x2';
}

export interface NavigationGroup {
  name: string;
  icon?: string;
  sort?: number;
  items: ResourceMeta[];
}

export function compareNavigationItems(a: ResourceMeta, b: ResourceMeta): number {
  const sortA = a.navigationSort ?? Number.POSITIVE_INFINITY;
  const sortB = b.navigationSort ?? Number.POSITIVE_INFINITY;
  if (sortA !== sortB) return sortA - sortB;
  return a.label.localeCompare(b.label);
}

export function indexNavigationConfig(
  navigation?: LoomNavigationOptions,
): {
  primary: Map<string, LoomNavigationGroupConfig>;
  secondary: Map<string, LoomNavigationGroupConfig>;
} {
  const primary = new Map<string, LoomNavigationGroupConfig>();
  const secondary = new Map<string, LoomNavigationGroupConfig>();

  for (const group of navigation?.groups ?? []) {
    const target =
      group.placement === 'secondary' ? secondary : primary;
    target.set(group.name, group);
  }
  for (const section of navigation?.sections ?? []) {
    secondary.set(section.name, { ...section, placement: 'secondary' });
  }

  return { primary, secondary };
}

export function menuLayoutContext(
  groups: NavigationGroup[],
  basePath: string,
  currentSlug?: string,
  pageTitle?: string,
  navigation?: LoomNavigationOptions,
): MenuLayoutContext {
  const { secondary: sectionConfig } = indexNavigationConfig(navigation);

  const menuRoots: MenuRoot[] = [
    {
      label: 'Dashboard',
      icon: 'home',
      href: basePath,
      rootIndex: 0,
      active: !currentSlug,
    },
    ...groups.map((group, index) => {
      const href = firstGroupHref(group, basePath);
      const active = Boolean(currentSlug && group.items.some((item) => item.slug === currentSlug));
      return {
        label: group.name,
        icon: group.icon ?? GROUP_ICONS[group.name] ?? 'squares-2x2',
        href,
        rootIndex: index + 1,
        active,
      };
    }),
  ];

  const menuActiveRootIndex = currentSlug
    ? (menuRoots.find((root) => root.active)?.rootIndex ?? null)
    : 0;

  const menuActiveRoot =
    menuActiveRootIndex !== null
      ? (menuRoots.find((root) => root.rootIndex === menuActiveRootIndex) ?? null)
      : null;

  const activeGroup = currentSlug
    ? groups.find((group) => group.items.some((item) => item.slug === currentSlug))
    : undefined;

  const menuSecondary = activeGroup
    ? buildSecondaryMenu(activeGroup, basePath, currentSlug, sectionConfig)
    : [];

  const breadcrumbs = buildBreadcrumbs(
    basePath,
    menuActiveRoot,
    activeGroup,
    currentSlug,
    pageTitle,
  );

  return {
    menuRoots,
    menuActiveRoot,
    menuActiveRootIndex,
    menuSecondary,
    breadcrumbs,
  };
}

function firstGroupHref(group: NavigationGroup, basePath: string): string {
  const sorted = [...group.items].sort(compareNavigationItems);
  return `${basePath}/${sorted[0]?.slug ?? ''}`;
}

function buildSecondaryMenu(
  group: NavigationGroup,
  basePath: string,
  currentSlug: string | undefined,
  sectionConfig: Map<string, LoomNavigationGroupConfig>,
): MenuSecondaryItem[] {
  const sectionMap = new Map<string, ResourceMeta[]>();
  const flatItems: ResourceMeta[] = [];

  for (const item of group.items) {
    const section = item.navigationSection;
    if (section) {
      const items = sectionMap.get(section) ?? [];
      items.push(item);
      sectionMap.set(section, items);
    } else {
      flatItems.push(item);
    }
  }

  const secondary: MenuSecondaryItem[] = [];

  const sectionEntries = [...sectionMap.entries()].sort(([a], [b]) => {
    const sortA = sectionConfig.get(a)?.sort ?? Number.POSITIVE_INFINITY;
    const sortB = sectionConfig.get(b)?.sort ?? Number.POSITIVE_INFINITY;
    if (sortA !== sortB) return sortA - sortB;
    return a.localeCompare(b);
  });

  for (const [label, items] of sectionEntries) {
    const config = sectionConfig.get(label);
    const children = items
      .sort(compareNavigationItems)
      .map((item) => ({
        label: item.label,
        href: `${basePath}/${item.slug}`,
        active: item.slug === currentSlug,
        icon: item.icon,
      }));
    secondary.push({
      label,
      icon: config?.icon,
      active: children.some((child) => child.active),
      children,
    });
  }

  for (const item of flatItems.sort(compareNavigationItems)) {
    secondary.push({
      label: item.label,
      href: `${basePath}/${item.slug}`,
      active: item.slug === currentSlug,
      icon: item.icon,
    });
  }

  return secondary;
}

function buildBreadcrumbs(
  basePath: string,
  activeRoot: MenuRoot | null,
  activeGroup: NavigationGroup | undefined,
  currentSlug?: string,
  pageTitle?: string,
): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ label: 'Home', href: basePath }];

  if (activeRoot && activeRoot.label !== 'Dashboard') {
    crumbs.push({ label: activeRoot.label, href: activeRoot.href });
  }

  if (currentSlug && activeGroup) {
    const resource = activeGroup.items.find((item) => item.slug === currentSlug);
    if (resource) {
      crumbs.push({ label: resource.label, href: `${basePath}/${resource.slug}` });
    }
  }

  if (pageTitle && crumbs[crumbs.length - 1]?.label !== pageTitle) {
    crumbs.push({ label: pageTitle });
  }

  return crumbs;
}
