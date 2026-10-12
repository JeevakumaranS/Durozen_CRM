import { UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
