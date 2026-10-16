import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class CreateCallMessageDto {
  @IsUUID()
  leadId!: string;

  @IsDateString()
  dueAt!: string;

  @IsString()
  contactMethod!: string;

  @IsIn(["PENDING", "COMPLETED"])
  status!: "PENDING" | "COMPLETED";

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  outcome?: string;
}
