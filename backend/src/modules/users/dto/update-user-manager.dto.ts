import { IsOptional, IsUUID } from "class-validator";

export class UpdateUserManagerDto {
  @IsOptional()
  @IsUUID()
  managerId?: string | null;
}
