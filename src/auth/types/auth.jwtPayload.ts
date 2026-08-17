import { Role } from '@prisma/client';

/** Claims carried inside the signed JWT. */
export type AuthJwtPayload = {
  sub: number;
  username: string;
  role: Role;
};

/** Shape attached to `req.user` once the strategy has validated the token. */
export type AuthenticatedUser = {
  id: number;
  username: string;
  role: Role;
};
