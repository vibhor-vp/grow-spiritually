import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'apps/backend/prisma/schema.prisma',
  migrations: {
    path: 'apps/backend/prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
