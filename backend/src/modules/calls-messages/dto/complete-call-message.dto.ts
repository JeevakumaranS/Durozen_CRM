import { IsOptional, IsString } from "class-validator";

export class CompleteCallMessageDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  outcome?: string;
}
