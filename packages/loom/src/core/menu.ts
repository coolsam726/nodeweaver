import type { ResourceMeta } from './types.js';

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
}

export interface MenuSecondaryItem {
  label: string;
  href?: string;
  active: boolean;
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
  items: ResourceMeta[];
}

export function menuLayoutContext(
  groups: NavigationGroup[],
  basePath: string,
  currentSlug?: string,
  pageTitle?: string,
): MenuLayoutContext {
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
    ? buildSecondaryMenu(activeGroup, basePath, currentSlug)
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
  const sorted = [...group.items].sort((a, b) => a.label.localeCompare(b.label));
  return `${basePath}/${sorted[0]?.slug ?? ''}`;
}

function buildSecondaryMenu(
  group: NavigationGroup,
  basePath: string,
  currentSlug?: string,
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

  for (const [label, items] of [...sectionMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const children = items
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((item) => ({
        label: item.label,
        href: `${basePath}/${item.slug}`,
        active: item.slug === currentSlug,
      }));
    secondary.push({
      label,
      active: children.some((child) => child.active),
      children,
    });
  }

  for (const item of flatItems.sort((a, b) => a.label.localeCompare(b.label))) {
    secondary.push({
      label: item.label,
      href: `${basePath}/${item.slug}`,
      active: item.slug === currentSlug,
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
