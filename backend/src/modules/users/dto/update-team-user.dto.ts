import { IsEmail, IsString, MinLength } from "class-validator";

export class UpdateTeamUserDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;
}
