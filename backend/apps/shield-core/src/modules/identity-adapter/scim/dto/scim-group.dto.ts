export class ScimGroupMemberDto {
  value!: string;
  $ref?: string;
  display?: string;
  type?: 'User' | 'Group';
}

export class CreateScimGroupDto {
  schemas!: string[];
  displayName!: string;
  members?: ScimGroupMemberDto[];
  externalId?: string;
}
