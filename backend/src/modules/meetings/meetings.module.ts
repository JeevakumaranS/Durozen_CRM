import { Module } from "@nestjs/common";
import { PipelineModule } from "../pipeline/pipeline.module";
import { MeetingsController } from "./meetings.controller";
import { MeetingsService } from "./meetings.service";

@Module({
  imports: [PipelineModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
