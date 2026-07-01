#!/bin/bash
# Full migration script: SQLite -> PostgreSQL
# This script reads data from SQLite and inserts into PostgreSQL

set -e

PG_URL="postgresql://icross_db_user:Ag2H8fUttw09lx1cyCOSIhEPLRRErq8h@dpg-d8unhpho3t8c73cf1oj0-a.oregon-postgres.render.com/icross_db"
SQLITE_DB="./db.sqlite3"

echo "🔍 Step 1: Checking connections..."

# Test PG connection
psql "$PG_URL" -c "SELECT 1;" > /dev/null 2>&1 || { echo "❌ Cannot connect to PG"; exit 1; }
echo "✅ PostgreSQL connected"

echo "🔧 Step 2: Adding missing columns to PG tables..."

cat << 'SQL' | psql "$PG_URL" > /dev/null 2>&1
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "school" VARCHAR(255) DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work" VARCHAR(255) DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "school_work_visibility" VARCHAR(20) DEFAULT 'public';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dob_visibility" VARCHAR(20) DEFAULT 'public';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sex_visibility" VARCHAR(20) DEFAULT 'public';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "looking_for_visibility" VARCHAR(20) DEFAULT 'public';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hobbies_visibility" VARCHAR(20) DEFAULT 'public';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_visibility" VARCHAR(20) DEFAULT 'friends';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_live" BOOLEAN DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "expo_push_token" VARCHAR(255) DEFAULT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_crosses" BOOLEAN DEFAULT true;
ALTER TABLE "cross_settings" ADD COLUMN IF NOT EXISTS "reveal_delay_minutes" INTEGER DEFAULT 60;
ALTER TABLE "cross_settings" ADD COLUMN IF NOT EXISTS "reveal_schedule_hour_1" INTEGER DEFAULT 10;
ALTER TABLE "cross_settings" ADD COLUMN IF NOT EXISTS "reveal_schedule_hour_2" INTEGER DEFAULT 22;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "is_request" BOOLEAN DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "disappearing_minutes" INTEGER DEFAULT 0;
ALTER TABLE "post_photos" ADD COLUMN IF NOT EXISTS "type" VARCHAR(10) DEFAULT 'photo';
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "audio" VARCHAR(500) DEFAULT NULL;
SQL

echo "✅ Columns ensured"

echo "📦 Step 3: Clearing existing data in PG (child tables first)..."
psql "$PG_URL" << 'SQL' > /dev/null 2>&1
TRUNCATE TABLE "recaps" CASCADE;
TRUNCATE TABLE "reports" CASCADE;
TRUNCATE TABLE "profile_likes" CASCADE;
TRUNCATE TABLE "cross_events" CASCADE;
TRUNCATE TABLE "notifications" CASCADE;
TRUNCATE TABLE "blocks" CASCADE;
TRUNCATE TABLE "friends" CASCADE;
TRUNCATE TABLE "friend_requests" CASCADE;
TRUNCATE TABLE "calls" CASCADE;
TRUNCATE TABLE "conversation_participants" CASCADE;
TRUNCATE TABLE "conversation_read_statuses" CASCADE;
TRUNCATE TABLE "messages" CASCADE;
TRUNCATE TABLE "conversations" CASCADE;
TRUNCATE TABLE "comments" CASCADE;
TRUNCATE TABLE "saved_posts" CASCADE;
TRUNCATE TABLE "post_likes" CASCADE;
TRUNCATE TABLE "post_photos" CASCADE;
TRUNCATE TABLE "posts" CASCADE;
TRUNCATE TABLE "cross_settings" CASCADE;
TRUNCATE TABLE "profile_galleries" CASCADE;
TRUNCATE TABLE "users" CASCADE;
TRUNCATE TABLE "hobbies" CASCADE;
SQL
echo "✅ PG data cleared (12 tables truncated)"

echo "📋 Step 4: Migrating data..."

# Helper function: export from SQLite to CSV, import to PG
migrate_table() {
    local TABLE=$1
    local ORDER_COL=$2
    
    echo "  -> Processing $TABLE..."
    
    # Get column list from SQLite
    local COLS=$(sqlite3 "$SQLITE_DB" "SELECT group_concat('\"' || name || '\"', ',') FROM pragma_table_info('$TABLE')")
    
    # Export to temp CSV with headers
    sqlite3 -header -csv "$SQLITE_DB" "SELECT * FROM \"$TABLE\" ORDER BY \"$ORDER_COL\";" > /tmp/migrate_${TABLE}.csv 2>/dev/null
    
    # Count rows (subtract 1 for header)
    local ROWS=$(tail -n +2 /tmp/migrate_${TABLE}.csv | wc -l)
    echo "     $ROWS rows exported from SQLite"
    
    if [ "$ROWS" -eq 0 ]; then
        rm -f /tmp/migrate_${TABLE}.csv
        return
    fi
    
    # Import to PG using the CSV headers as column names
    psql "$PG_URL" -c "\copy \"$TABLE\" FROM '/tmp/migrate_${TABLE}.csv' WITH CSV HEADER;" 2>&1 | tail -1
    
    rm -f /tmp/migrate_${TABLE}.csv
}

# Migrate tables in dependency order (parents first)
migrate_table "hobbies" "id"
migrate_table "users" "id"
migrate_table "profile_galleries" "id"
migrate_table "cross_settings" "id"
migrate_table "posts" "id"
migrate_table "post_photos" "id"
migrate_table "post_likes" "id"
migrate_table "saved_posts" "id"
migrate_table "comments" "id"
migrate_table "conversations" "id"
migrate_table "messages" "id"
migrate_table "conversation_read_statuses" "id"
migrate_table "conversation_participants" "conversation_id"
migrate_table "calls" "id"
migrate_table "friend_requests" "id"
migrate_table "friends" "id"
migrate_table "blocks" "id"
migrate_table "notifications" "id"
migrate_table "cross_events" "id"
migrate_table "profile_likes" "id"
migrate_table "reports" "id"
migrate_table "recaps" "id"

echo "🔧 Step 5: Resetting sequences..."
psql "$PG_URL" << 'SQL' > /dev/null 2>&1
SELECT setval('"hobbies_id_seq"', COALESCE((SELECT MAX(id) FROM "hobbies"), 0) + 1, false);
SELECT setval('"users_id_seq"', COALESCE((SELECT MAX(id) FROM "users"), 0) + 1, false);
SELECT setval('"profile_galleries_id_seq"', COALESCE((SELECT MAX(id) FROM "profile_galleries"), 0) + 1, false);
SELECT setval('"cross_settings_id_seq"', COALESCE((SELECT MAX(id) FROM "cross_settings"), 0) + 1, false);
SELECT setval('"posts_id_seq"', COALESCE((SELECT MAX(id) FROM "posts"), 0) + 1, false);
SELECT setval('"post_photos_id_seq"', COALESCE((SELECT MAX(id) FROM "post_photos"), 0) + 1, false);
SELECT setval('"post_likes_id_seq"', COALESCE((SELECT MAX(id) FROM "post_likes"), 0) + 1, false);
SELECT setval('"saved_posts_id_seq"', COALESCE((SELECT MAX(id) FROM "saved_posts"), 0) + 1, false);
SELECT setval('"comments_id_seq"', COALESCE((SELECT MAX(id) FROM "comments"), 0) + 1, false);
SELECT setval('"conversations_id_seq"', COALESCE((SELECT MAX(id) FROM "conversations"), 0) + 1, false);
SELECT setval('"messages_id_seq"', COALESCE((SELECT MAX(id) FROM "messages"), 0) + 1, false);
SELECT setval('"conversation_read_statuses_id_seq"', COALESCE((SELECT MAX(id) FROM "conversation_read_statuses"), 0) + 1, false);
SELECT setval('"calls_id_seq"', COALESCE((SELECT MAX(id) FROM "calls"), 0) + 1, false);
SELECT setval('"friend_requests_id_seq"', COALESCE((SELECT MAX(id) FROM "friend_requests"), 0) + 1, false);
SELECT setval('"friends_id_seq"', COALESCE((SELECT MAX(id) FROM "friends"), 0) + 1, false);
SELECT setval('"blocks_id_seq"', COALESCE((SELECT MAX(id) FROM "blocks"), 0) + 1, false);
SELECT setval('"notifications_id_seq"', COALESCE((SELECT MAX(id) FROM "notifications"), 0) + 1, false);
SELECT setval('"cross_events_id_seq"', COALESCE((SELECT MAX(id) FROM "cross_events"), 0) + 1, false);
SELECT setval('"profile_likes_id_seq"', COALESCE((SELECT MAX(id) FROM "profile_likes"), 0) + 1, false);
SELECT setval('"reports_id_seq"', COALESCE((SELECT MAX(id) FROM "reports"), 0) + 1, false);
SELECT setval('"recaps_id_seq"', COALESCE((SELECT MAX(id) FROM "recaps"), 0) + 1, false);
SQL

echo "✅ Sequences reset"

# Verify
echo ""
echo "📊 Step 6: Verification..."
echo "  SQLite counts:"
sqlite3 "$SQLITE_DB" "SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'posts', COUNT(*) FROM posts UNION ALL SELECT 'messages', COUNT(*) FROM messages UNION ALL SELECT 'cross_events', COUNT(*) FROM cross_events;"

echo ""
echo "  PostgreSQL counts:"
psql "$PG_URL" -c "SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'posts', COUNT(*) FROM posts UNION ALL SELECT 'messages', COUNT(*) FROM messages UNION ALL SELECT 'cross_events', COUNT(*) FROM cross_events;"

echo ""
echo "🎉 Migration complete!"