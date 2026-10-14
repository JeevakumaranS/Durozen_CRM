import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";

export class CreateUserDto {
  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsIn(["BDE", "SALES_MANAGER"])
  role!: "BDE" | "SALES_MANAGER";

  @IsOptional()
  @IsUUID()
  managerId?: string;
}
