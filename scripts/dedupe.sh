#!/bin/bash

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print usage
usage() {
    cat <<EOF
Usage: $0 <db_file> <table> <column> [--apply]

Arguments:
  <db_file>   Path to SQLite database file
  <table>     Table name to deduplicate
  <column>    Column to check for duplicates

Options:
  --apply     Actually perform the deduplication (dry-run by default)

Example:
  $0 db.sqlite notes text
  $0 db.sqlite notes text --apply

EOF
    exit 1
}

# Validate arguments
if [[ $# -lt 3 ]]; then
    usage
fi

DB_FILE="$1"
TABLE="$2"
COLUMN="$3"
APPLY=false

if [[ $# -gt 3 && "$4" == "--apply" ]]; then
    APPLY=true
fi

# Validate database file exists
if [[ ! -f "$DB_FILE" ]]; then
    echo -e "${RED}Error: Database file '$DB_FILE' not found${NC}"
    exit 1
fi

# Validate table exists
TABLE_EXISTS=$(sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name='$TABLE';" 2>/dev/null || echo "")
if [[ -z "$TABLE_EXISTS" ]]; then
    echo -e "${RED}Error: Table '$TABLE' not found in database${NC}"
    exit 1
fi

# Validate column exists
COLUMN_EXISTS=$(sqlite3 "$DB_FILE" "PRAGMA table_info($TABLE);" | grep "^[0-9]*|$COLUMN|" || echo "")
if [[ -z "$COLUMN_EXISTS" ]]; then
    echo -e "${RED}Error: Column '$COLUMN' not found in table '$TABLE'${NC}"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SQLite Deduplication Report${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo "Database:  $DB_FILE"
echo "Table:     $TABLE"
echo "Column:    $COLUMN"
echo ""

# Get total records
TOTAL=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $TABLE;")
echo -e "Total records:     ${YELLOW}$TOTAL${NC}"

# Get unique records
UNIQUE=$(sqlite3 "$DB_FILE" "SELECT COUNT(DISTINCT $COLUMN) FROM $TABLE;")
echo -e "Unique records:    ${YELLOW}$UNIQUE${NC}"

# Get duplicate count
DUPLICATES=$((TOTAL - UNIQUE))
echo -e "Duplicate records: ${RED}$DUPLICATES${NC}"

if [[ $DUPLICATES -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}✓ No duplicates found!${NC}"
    exit 0
fi

# Show top duplicates
echo ""
echo -e "${BLUE}Top 10 duplicate values:${NC}"
sqlite3 "$DB_FILE" << EOF
SELECT 
  COUNT(*) as count,
  SUBSTR($COLUMN, 1, 80) || CASE WHEN LENGTH($COLUMN) > 80 THEN '...' ELSE '' END as value
FROM $TABLE
GROUP BY $COLUMN
HAVING count > 1
ORDER BY count DESC
LIMIT 10;
EOF

echo ""

if [[ "$APPLY" == true ]]; then
    echo -e "${YELLOW}Creating backup...${NC}"
    BACKUP_FILE="${DB_FILE}.backup-dedupe-$(date +%Y%m%d-%H%M%S)"
    cp "$DB_FILE" "$BACKUP_FILE"
    echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"
    echo ""
    
    echo -e "${YELLOW}Applying deduplication...${NC}"
    sqlite3 "$DB_FILE" "DELETE FROM $TABLE WHERE rowid NOT IN (SELECT MIN(rowid) FROM $TABLE GROUP BY $COLUMN);"
    
    NEW_TOTAL=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $TABLE;")
    REMOVED=$((TOTAL - NEW_TOTAL))
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Deduplication complete!${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo "Records before:  $TOTAL"
    echo "Records after:   $NEW_TOTAL"
    echo -e "Records removed: ${GREEN}$REMOVED${NC}"
else
    echo -e "${YELLOW}Dry-run mode${NC}"
    echo -e "To apply deduplication, run with ${BLUE}--apply${NC} flag:"
    echo ""
    echo -e "  ${BLUE}$0 $DB_FILE $TABLE $COLUMN --apply${NC}"
fi

echo ""
