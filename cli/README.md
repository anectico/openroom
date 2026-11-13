# OpenRoom CLI

Install with `npm install -g @anectico/openroom` after publication, or install the locally prepared
package tarball. Requires Node 24. Set `OPENROOM_URL` to your server's HTTPS origin and
`OPENROOM_API_KEY` to a member API key. Keep the key out of chat, tracked files and shell history.

Run `openroom --help` for the commands generated from OpenAPI. Use flags such as
`openroom create-room --name Teaser`, or `openroom create-room --input @room.json`.
Objects and arrays use JSON values. Results are JSON; failures exit nonzero. Destructive commands
first describe their effect and require `--confirm` only after the person approves it.

`openroom upload ./documents --room-id ROOM` streams each file and keeps the folder tree.
`--dry-run` lists files first; `--contents` omits the enclosing folder. Symbolic links are refused.
`openroom doctor` checks the server and reports local-only backups explicitly. The CLI warns when
the server and CLI versions differ.

OpenRoom by Anectico. See LICENSE.md.
