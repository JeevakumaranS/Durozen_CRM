import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { PerformanceModule } from "../performance/performance.module";
import { ReportsModule } from "../reports/reports.module";
import { UsersModule } from "../users/users.module";
import { AdminController } from "./admin.controller";

@Module({
  imports: [UsersModule, DashboardModule, PerformanceModule, ReportsModule],
  controllers: [AdminController],
})
export class AdminModule {}
