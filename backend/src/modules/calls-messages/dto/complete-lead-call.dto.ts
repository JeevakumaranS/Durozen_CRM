import { IsIn, IsUUID } from "class-validator";
import { CompleteCallMessageDto } from "./complete-call-message.dto";

export class CompleteLeadCallDto extends CompleteCallMessageDto {
  @IsUUID()
  leadId!: string;

  @IsIn(["Phone Call", "WhatsApp", "Email"])
  contactMethod!: string;
}
