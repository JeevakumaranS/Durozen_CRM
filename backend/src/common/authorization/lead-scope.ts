import { Prisma } from "@prisma/client";
import { Actor, assertActorRole } from "./actor-role";

export function leadScope(actor: Actor): Prisma.LeadWhereInput {
  assertActorRole(actor, ["ADMIN", "SALES_MANAGER", "BDE"]);
  if (actor.role === "BDE") return { assignedBdeId: actor.sub };
  if (actor.role === "SALES_MANAGER") {
    return { assignedBde: { managerId: actor.sub } };
  }
  return {};
}
