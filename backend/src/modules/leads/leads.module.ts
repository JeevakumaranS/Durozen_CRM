import { Module } from "@nestjs/common";
import { PipelineModule } from "../pipeline/pipeline.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
@Module({
  imports: [PipelineModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
