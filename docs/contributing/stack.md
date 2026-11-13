# Stack

The libraries OpenRoom uses and why. A new dependency must be actively maintained, widely used,
permissively licensed (MIT, Apache-2.0 or similar, never AGPL) and must not need an outside service.
Prefer a library to writing the same thing ourselves.

| Need                                   | Library                                                                                                                                                       | In use |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Framework                              | SvelteKit 3, Svelte 5, `@sveltejs/adapter-node`, run inside our own small Node server                                                                         | yes    |
| Admin UI                               | shadcn-svelte (bits-ui), Tailwind CSS 4, `clsx` and `tailwind-merge`                                                                                          | yes    |
| Database                               | SQLite through `better-sqlite3` (prebuilt binaries; its install script stays off) and Drizzle ORM; drizzle-kit writes the migrations, our runner applies them | yes    |
| Replication                            | Litestream 0.5.17, a child of the launcher                                                                                                                    | yes    |
| Jobs and schedules                     | Our `jobs` table and worker loop                                                                                                                              | yes    |
| Validation                             | Zod 4 in every operation; pages post JSON to the operations                                                                                                   | yes    |
| API description                        | Zod 4's `z.toJSONSchema`                                                                                                                                      | yes    |
| Members, sessions, passwords, API keys | Better Auth with `@better-auth/api-key`, without its admin plugin                                                                                             | yes    |
| File type from content                 | file-type                                                                                                                                                     | yes    |
| File storage                           | FlyDrive disk/S3; AWS SDK S3 client and multipart `@aws-sdk/lib-storage`                                                                                      | yes    |
| Email                                  | Nodemailer and the `resend` SDK                                                                                                                               | yes    |
| Lint and format                        | Biome                                                                                                                                                         | yes    |
| MCP                                    | `@modelcontextprotocol/server` 2.x (`createMcpHandler`)                                                                                                       | yes    |
| PDF viewing and page count             | pdfjs-dist                                                                                                                                                    | yes    |
| PDF writing                            | `@cantoo/pdf-lib`                                                                                                                                             | yes    |
| Zip streaming                          | archiver                                                                                                                                                      | yes    |
| Logo re-encoding                       | sharp                                                                                                                                                         | yes    |
| Markdown                               | markdown-it with HTML off                                                                                                                                     | yes    |

The independent CLI package uses Commander 14. Its checked-in command catalog is generated from
OpenAPI by `npm run cli:generate`; CI detects drift. Security overrides pin patched minimatch and
esbuild versions used transitively by archiver and drizzle-kit.
