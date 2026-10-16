import { Module } from "@nestjs/common";
import { CallsMessagesController } from "./calls-messages.controller";
import { CallsMessagesService } from "./calls-messages.service";

@Module({
  controllers: [CallsMessagesController],
  providers: [CallsMessagesService],
})
export class CallsMessagesModule {}
