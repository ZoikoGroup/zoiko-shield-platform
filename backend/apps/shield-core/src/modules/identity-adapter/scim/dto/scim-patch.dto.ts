export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: any;
}

export class ScimPatchDto {
  schemas!: string[];
  Operations!: ScimPatchOperation[];
}
