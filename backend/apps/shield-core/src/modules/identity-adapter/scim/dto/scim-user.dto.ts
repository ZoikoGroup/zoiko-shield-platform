export class ScimUserNameDto {
  formatted?: string;
  familyName?: string;
  givenName?: string;
  middleName?: string;
  honorificPrefix?: string;
  honorificSuffix?: string;
}

export class ScimEmailDto {
  value!: string;
  type?: string;
  primary?: boolean;
}

export class CreateScimUserDto {
  schemas!: string[];
  userName!: string;
  name?: ScimUserNameDto;
  displayName?: string;
  nickName?: string;
  profileUrl?: string;
  title?: string;
  userType?: string;
  preferredLanguage?: string;
  locale?: string;
  timezone?: string;
  active?: boolean;
  emails?: ScimEmailDto[];
  externalId?: string;
}
