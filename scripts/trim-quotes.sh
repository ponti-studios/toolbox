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
  <table>     Table name to update
  <column>    Column to remove quotes from

Options:
  --apply     Actually perform the update (dry-run by default)

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
echo -e "${BLUE}Quote Removal Report${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo "Database:  $DB_FILE"
echo "Table:     $TABLE"
echo "Column:    $COLUMN"
echo ""

# Count records with wrapping quotes (both leading AND trailing)
QUOTED=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $TABLE WHERE $COLUMN LIKE '\"%%\"';")
echo -e "Records with wrapping quotes: ${YELLOW}$QUOTED${NC}"

if [[ $QUOTED -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}✓ No quoted values found!${NC}"
    exit 0
fi

# Show examples
echo ""
echo -e "${BLUE}Examples of wrapped quoted values:${NC}"
sqlite3 "$DB_FILE" << EOF
SELECT 
  SUBSTR($COLUMN, 1, 100) || CASE WHEN LENGTH($COLUMN) > 100 THEN '...' ELSE '' END as value
FROM $TABLE
WHERE $COLUMN LIKE '\"%%\"'
LIMIT 10;
EOF

echo ""

if [[ "$APPLY" == true ]]; then
    echo -e "${YELLOW}Creating backup...${NC}"
    BACKUP_FILE="${DB_FILE}.backup-trim-quotes-$(date +%Y%m%d-%H%M%S)"
    cp "$DB_FILE" "$BACKUP_FILE"
    echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"
    echo ""
    
    echo -e "${YELLOW}Removing wrapping quotes...${NC}"
    sqlite3 "$DB_FILE" "UPDATE $TABLE SET $COLUMN = SUBSTR($COLUMN, 2, LENGTH($COLUMN) - 2) WHERE $COLUMN LIKE '\"%%\"';"
    
    UPDATED=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $TABLE WHERE $COLUMN LIKE '\"%%\"';")
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Quote removal complete!${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo "Records with wrapping quotes before: $QUOTED"
    echo -e "Records with wrapping quotes after:  ${GREEN}$UPDATED${NC}"
else
    echo -e "${YELLOW}Dry-run mode${NC}"
    echo -e "To apply quote removal, run with ${BLUE}--apply${NC} flag:"
    echo ""
    echo -e "  ${BLUE}$0 $DB_FILE $TABLE $COLUMN --apply${NC}"
fi

echo ""
