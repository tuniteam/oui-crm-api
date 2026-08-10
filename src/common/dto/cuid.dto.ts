import { IsCuid } from '../decorators';

export class CuidDto {
  @IsCuid()
  cuid: string;
}
