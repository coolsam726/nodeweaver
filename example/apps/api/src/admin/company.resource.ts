import { Company } from '../database/company.schema';
import { CompanyResourceBase } from '@nestweaver/loom/base';

export class CompanyResource extends CompanyResourceBase {
  static override model = Company;
}
