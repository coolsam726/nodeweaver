import { User } from '../database/user.schema';
import { UserResourceBase } from '@nestweaver/loom/base';

export class UserResource extends UserResourceBase {
  static override model = User;
}
