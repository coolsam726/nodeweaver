import { resolveFields, type Field } from './fields.js';
import type { FieldConfig } from './types.js';

export interface SchemaSection {
  name: string;
  title: string;
  description?: string;
  columns?: 1 | 2 | 3;
  fields: FieldConfig[];
}

export interface FormSchema {
  sections: SchemaSection[];
  /** Flat field list (all sections) for adapter + validation */
  fields: FieldConfig[];
}

export class FormSchemaBuilder {
  private sections: SchemaSection[] = [];
  private current?: SchemaSection;

  section(name: string, title: string, description?: string): this {
    this.current = { name, title, description, columns: 2, fields: [] };
    this.sections.push(this.current);
    return this;
  }

  columns(count: 1 | 2 | 3): this {
    if (this.current) this.current.columns = count;
    return this;
  }

  fields(...entries: Field[]): this {
    const resolved = resolveFields(entries);
    if (this.current) {
      this.current.fields.push(...resolved);
    } else {
      this.sections.push({
        name: 'default',
        title: 'Details',
        columns: 2,
        fields: resolved,
      });
    }
    return this;
  }

  field(field: Field): this {
    return this.fields(field);
  }

  build(): FormSchema {
    const fields = this.sections.flatMap((section) => section.fields);
    return { sections: this.sections, fields };
  }

  static from(schema: FormSchema): FormSchemaBuilder {
    const builder = new FormSchemaBuilder();
    for (const section of schema.sections) {
      builder.section(section.name, section.title, section.description);
      if (section.columns) builder.columns(section.columns);
      const stubFields = section.fields.map(
        (config) =>
          ({
            build: () => ({ ...config }),
          }) as Field,
      );
      builder.fields(...stubFields);
    }
    return builder;
  }
}

/** Filament-style alias */
export class Schema extends FormSchemaBuilder {}
