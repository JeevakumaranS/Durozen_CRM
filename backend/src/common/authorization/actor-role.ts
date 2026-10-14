import { ForbiddenException } from "@nestjs/common";

export type Actor = { sub: string; role: string };

export function assertActorRole(
  actor: Actor,
  allowedRoles: readonly string[],
): void {
  if (!allowedRoles.includes(actor.role)) {
    throw new ForbiddenException();
  }
}
