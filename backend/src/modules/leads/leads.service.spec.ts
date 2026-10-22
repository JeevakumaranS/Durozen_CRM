import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { LeadsService } from "./leads.service";

const admin = { sub: "admin-1", role: "ADMIN" };
const transitions = {
  assertAllowed: () => undefined,
  canTransition: () => true,
} as StageTransitionService;

function createPaymentService(
  paidAmount: number,
  finalDealValue = 1000,
) {
  let leadUpdate: { data: Record<string, unknown> } | undefined;
  let activityCreate: { data: Record<string, unknown> } | undefined;
  const service = new LeadsService(
    {
      lead: {
        findFirst: async (args: { select?: Record<string, boolean> }) =>
          args.select?.id
            ? { id: "lead-1" }
            : {
                stage: LeadStage.WON,
                finalDealValue: new Prisma.Decimal(finalDealValue),
                paidAmount: new Prisma.Decimal(paidAmount),
              },
        update: async (args: { data: Record<string, unknown> }) => {
          leadUpdate = args;
          return { id: "lead-1", ...args.data };
        },
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [],
          lead: {
            findFirst: async () => ({
              stage: LeadStage.WON,
              finalDealValue: new Prisma.Decimal(finalDealValue),
              paidAmount: new Prisma.Decimal(paidAmount),
            }),
            update: async (args: { data: Record<string, unknown> }) => {
              leadUpdate = args;
              return { id: "lead-1", ...args.data };
            },
          },
          activity: {
            create: async (args: { data: Record<string, unknown> }) => {
              activityCreate = args;
              return args.data;
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );
  return {
    service,
    getLeadUpdate: () => leadUpdate,
    getActivityCreate: () => activityCreate,
  };
}

test("logging a payment calculates partial paid total and balance", async () => {
  const payment = createPaymentService(200);

  await payment.service.recordPayment("lead-1", 300, admin);

  assert.equal(payment.getLeadUpdate()?.data.paymentStatus, "Partial Payment");
  assert.equal(
    (payment.getLeadUpdate()?.data.paidAmount as Prisma.Decimal).toNumber(),
    500,
  );
  assert.equal(payment.getActivityCreate()?.data.type, "PAYMENT_RECEIVED");
  assert.equal(payment.getActivityCreate()?.data.paymentStatus, "Partial Payment");
  assert.equal(
    (payment.getActivityCreate()?.data.paymentBalance as Prisma.Decimal).toNumber(),
    500,
  );
});

test("logging the remaining balance marks the deal fully paid", async () => {
  const payment = createPaymentService(700);

  await payment.service.recordPayment("lead-1", 300, admin);

  assert.equal(payment.getLeadUpdate()?.data.paymentStatus, "Fully Paid");
  assert.equal(
    (payment.getActivityCreate()?.data.paymentBalance as Prisma.Decimal).toNumber(),
    0,
  );
});

test("a payment cannot exceed the remaining deal balance", async () => {
  const payment = createPaymentService(900);

  await assert.rejects(
    payment.service.recordPayment("lead-1", 101, admin),
    BadRequestException,
  );
  assert.equal(payment.getLeadUpdate(), undefined);
  assert.equal(payment.getActivityCreate(), undefined);
});

test("payment amount must use currency precision", async () => {
  const payment = createPaymentService(0);

  await assert.rejects(
    payment.service.recordPayment("lead-1", 10.123, admin),
    BadRequestException,
  );
  assert.equal(payment.getLeadUpdate(), undefined);
  assert.equal(payment.getActivityCreate(), undefined);
});

test("sales managers cannot create leads", async () => {
  const service = new LeadsService(
    {} as PrismaService,
    transitions,
  );
  const dto = Object.assign(new CreateLeadDto(), {
    customerName: "Test lead",
    mobileNumber: "1234567",
    leadSource: "Website",
    assignedBdeId: "11111111-1111-4111-8111-111111111111",
    nextAction: "Call",
    followUpAt: "2026-10-23T10:00:00.000Z",
  });

  await assert.rejects(
    service.create(dto, { sub: "manager-1", role: "SALES_MANAGER" }),
    ForbiddenException,
  );
});
