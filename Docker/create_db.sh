#!/bin/bash
set -e

# Start the PostgreSQL process
# This must be done so that the PostgreSQL process starts.
exec docker-entrypoint.sh postgres &

# Wait for PostgreSQL to be ready 
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -U election; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

echo "PostgreSQL is ready."

# Check if the database is empty
DB_EXISTS=$(psql -U election -d election -tAc "SELECT 1 FROM pg_database WHERE datname='election'")

if [ -z "$DB_EXISTS" ]; then
  echo "Database is empty, restoring from backup..."
  psql -U election -d election < /docker_backup/backup.sql
else
  echo "Database is not empty, skipping restore."
fi

# Also check if there are no tables
DB_EXISTS=$(psql -U election -d election -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")

if [ "$DB_EXISTS" -eq 0 ]; then
  echo "Database has no tables, restoring from backup..."
  psql -U election -d election < /docker_backup/backup.sql
else
  echo "Database has tables, skipping restore."
fi

# Continue running the original PostgreSQL process in the foreground
wait
