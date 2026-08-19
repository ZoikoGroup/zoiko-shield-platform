export class ScimQueryDto {
  filter?: string;
  startIndex?: number;
  count?: number;
  sortBy?: string;
  sortOrder?: 'ascending' | 'descending';
  attributes?: string;
  excludedAttributes?: string;
}
