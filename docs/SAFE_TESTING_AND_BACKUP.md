# Safe testing, backup and recovery

This guide keeps development tests separate from a normal OpenFamily installation.

## Disposable PostgreSQL for server tests

The root `docker-compose.yml` is the application stack. **Do not use it as the test database.**
Use the dedicated `docker-compose.test.yml` file instead:

```bash
docker compose -f docker-compose.test.yml up -d --wait
```

It starts only PostgreSQL, binds it to loopback port `55432`, uses the database
`openfamily_test`, and stores PostgreSQL data in container tmpfs rather than a
persistent Docker volume.

Run the server suite with explicit test connection settings:

```bash
cd server
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_DB=openfamily_test POSTGRES_USER=openfamily POSTGRES_PASSWORD=openfamily npm test
```

The test setup rejects database names without the `_test` suffix, non-loopback
hosts, and invalid ports. GitHub Actions has one narrowly scoped exception:
the `postgres` service hostname is accepted only when `GITHUB_ACTIONS=true`.

When finished, remove the disposable test container:

```bash
docker compose -f docker-compose.test.yml down
```

There is no named volume in this compose file. The test database is intentionally
disposable and is lost when its container is removed. Do not add a production
database, production credentials, or real family data to this environment.

## Back up all user data

A PostgreSQL dump does not include files stored in `server/uploads`. Back up
both the database and uploads, and keep the matching `.env` securely because
the same `JWT_SECRET` is needed to decrypt stored integration credentials.

From the application directory:

```bash
set -eu
stamp=$(date +%F-%H%M%S)
docker compose exec -T postgres pg_dump -U openfamily -d openfamily -Fc > "openfamily-$stamp.dump"
pg_restore --list "openfamily-$stamp.dump" > "openfamily-$stamp.contents.txt"
tar -czf "openfamily-uploads-$stamp.tar.gz" -C server uploads
cp .env ".env-$stamp.backup"
```

Keep the dump, uploads archive, and environment backup together in protected
storage. Restrict access: the dump and uploads can contain private family data,
and the environment file contains secrets. Verify that the dump listing command
succeeds and that the resulting files are non-empty before relying on the backup.

## Restore without overwriting the current database

Never use `pg_restore --clean` against the current application database as a
routine recovery step. Restore into a **new, uniquely named database** first.
The following example uses `openfamily_restore_YYYYMMDD`; replace the suffix
with a name that does not already exist.

1. Confirm the dump is readable:

   ```bash
   pg_restore --list openfamily-YYYY-MM-DD-HHMMSS.dump
   ```

2. Create a new database (this does not replace the current `openfamily` database):

   ```bash
   docker compose exec postgres createdb -U openfamily openfamily_restore_YYYYMMDD
   ```

3. Restore into that new database, stopping on the first error:

   ```bash
   cat openfamily-YYYY-MM-DD-HHMMSS.dump | docker compose exec -T postgres pg_restore -U openfamily -d openfamily_restore_YYYYMMDD --no-owner --no-privileges --exit-on-error
   ```

4. Validate the restored database before directing the application to it. Keep
   the existing `openfamily` database untouched. To test the restored instance,
   change only the server's `POSTGRES_DB` setting to the new database name and
   recreate the server container; do not remove or recreate the PostgreSQL
   volume. Keep a copy of the previous `.env` so the server can be pointed back
   to the original database if validation fails.

5. Restore uploads separately and cautiously. Extract the uploads archive to a
   temporary directory, inspect it, and preserve the current `server/uploads`
   directory before copying anything into place. Do not blindly overwrite it.

A restore is not complete until the application has been checked against the
restored database and the corresponding uploads. Keep the original database and
backup files until that validation is finished.

## Rollback principles

- Work on a separate Git branch; do not merge into `main` until reviewed.
- Before any future database migration, take and verify a fresh database dump
  and uploads archive.
- Do not run `docker compose down -v` on an application stack unless you have
  deliberately decided to delete its persistent PostgreSQL volume.
- If a restored database fails validation, point the server back to the original
  database using the saved environment settings. The original database was not
  modified by the isolated restore procedure.
