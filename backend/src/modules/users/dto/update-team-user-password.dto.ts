import { IsString, MinLength } from "class-validator";

export class UpdateTeamUserPasswordDto {
  @IsString()
  @MinLength(10)
  password!: string;
}
