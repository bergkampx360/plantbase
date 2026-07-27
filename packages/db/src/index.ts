export { prisma } from './client';
export type { ProductModel as Product } from './generated/prisma/models';
export type {
  ThreadModel as Thread,
  MessageModel as Message,
} from './generated/prisma/models';
// Message.parts (Json?, H4) perzisztálásához kell az InputJsonValue típus a
// hívó oldalon (apps/server)
export type { InputJsonValue } from './generated/prisma/internal/prismaNamespace';
