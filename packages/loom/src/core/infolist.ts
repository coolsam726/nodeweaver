import type { ColumnConfig, FieldConfig, ColumnSpan } from './types.js';
import { resolveColumns, type Column } from './fields.js';

export interface InfolistSection {
  name: string;
  title: string;
  description?: string;
  columns?: 1 | 2 | 3 | 4;
  entries: InfolistEntryConfig[];
}

export interface InfolistEntryConfig {
  name: string;
  label?: string;
  type?: ColumnConfig['type'];
  format?: ColumnConfig['format'];
  relation?: ColumnConfig['relation'];
  columnSpan?: ColumnSpan;
  columnStart?: number;
}

export interface InfolistSchema {
  sections: InfolistSection[];
}

export class InfolistBuilder {
  private sections: InfolistSection[] = [];
  private current?: InfolistSection;

  section(name: string, title: string, description?: string): this {
    this.current = { name, title, description, columns: 2, entries: [] };
    this.sections.push(this.current);
    return this;
  }

  columns(count: 1 | 2 | 3 | 4): this {
    if (this.current) this.current.columns = count;
    return this;
  }

  entries(...columns: Column[]): this {
    const resolved = resolveColumns(columns).map((col) => ({
      name: col.name,
      label: col.label,
      type: col.type,
      format: col.format,
      relation: col.relation,
      columnSpan: col.columnSpan,
      columnStart: col.columnStart,
    }));
    if (this.current) {
      this.current.entries.push(...resolved);
    } else {
      this.sections.push({
        name: 'default',
        title: 'Details',
        columns: 2,
        entries: resolved,
      });
    }
    return this;
  }

  entry(name: string, label?: string): this {
    if (!this.current) {
      this.section('default', 'Details');
    }
    this.current!.entries.push({ name, label });
    return this;
  }

  build(): InfolistSchema {
    return { sections: this.sections };
  }
}

/** Build a readonly infolist from form fields when no detail schema is defined */
export function infolistFromFields(fields: FieldConfig[]): InfolistSchema {
  return {
    sections: [
      {
        name: 'details',
        title: 'Details',
        columns: 2,
        entries: fields
          .filter((field) => !field.hiddenOnForm)
          .map((field) => ({
            name: field.name,
            label: field.label,
            type: field.type,
            relation: field.relation,
          })),
      },
    ],
  };
}
