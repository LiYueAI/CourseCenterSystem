#!/bin/bash
# Course Platform Data Initialization Script
# Usage: ./init-data.sh

set -e

DIRECTUS_URL="${DIRECTUS_URL:-http://localhost:8055}"
EMAIL="${DIRECTUS_EMAIL:-admin@course-platform.com}"
PASSWORD="${DIRECTUS_PASSWORD:-ExpertAdmin2026@Directus}"

echo "Logging in to Directus..."
TOKEN=$(curl -s -X POST "$DIRECTUS_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

echo "Token: ${TOKEN:0:20}..."

# Create collections
create_collection() {
  local name="$1"
  local schema="$2"
  curl -s -X POST "$DIRECTUS_URL/collections" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$schema" > /dev/null && echo "Created: $name"
}

# Create all collections if they don't exist
echo "Setting up collections..."
create_collection "units" '{
  "collection": "units",
  "meta": {"note": "课程单元"},
  "schema": {"name": "units"},
  "fields": [
    {"field": "id", "type": "integer", "schema": {"has_auto_increment": true, "is_primary_key": true}},
    {"field": "unit_index", "type": "integer", "schema": {"is_required": true}},
    {"field": "title", "type": "string", "schema": {"is_required": true, "max_length": 200}}
  ]
}'

# (Collections already exist - skipping recreate)

# Set public read permissions
echo "Setting up permissions..."
for collection in units lessons lesson_modules module_items resources lesson_customizations classrooms; do
  curl -s -X POST "$DIRECTUS_URL/permissions" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"role\": \"PUBLIC\", \"collection\": \"$collection\", \"action\": \"read\"}" > /dev/null
  echo "Read: $collection"
done

# Create all 26 units
echo "Creating 26 units..."
for i in $(seq 1 26); do
  titles=(
    "第1站：礼乐是孩子心中的回声"
    "第2站：编钟的奥秘"
    "第3站：走进周公庙"
    "第4站：礼乐少年"
    "第5站：诗礼传家"
    "第6站：乐以象德"
    "第7站：钟鸣鼎食"
    "第8站：金声玉振"
    "第9站：八音克谐"
    "第10站：天子之乐"
    "第11站：雅乐正声"
    "第12站：礼乐文明"
    "第13站：乐教化人"
    "第14站：诗乐合一"
    "第15站：礼乐修身"
    "第16站：钟鼓云乐"
    "第17站：礼乐观德"
    "第18站：乐礼人生"
    "第19站：编钟探秘"
    "第20站：礼乐之道"
    "第21站：雅颂风韵"
    "第22站：乐从天籁"
    "第23站：礼乐情"
    "第24站：钟磬和鸣"
    "第25站：礼乐中国"
    "第26站：传承创新"
  )
  curl -s -X POST "$DIRECTUS_URL/items/units" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"unit_index\": $i, \"title\": \"${titles[$((i-1))]}\"}" > /dev/null
  echo -n "$i "
done
echo ""
echo "Units created!"

# Get all unit IDs and create 4 lessons per unit
echo "Creating 104 lessons (4 per unit)..."
UNITS=$(curl -s "$DIRECTUS_URL/items/units?fields=id&sort=unit_index" \
  -H "Authorization: Bearer $TOKEN")

count=0
for unit_id in $(echo $UNITS | python3 -c "import sys,json; data=json.load(sys.stdin); print(' '.join([str(u['id']) for u in data['data']]))"); do
  for lesson_idx in 1 2 3 4; do
    curl -s -X POST "$DIRECTUS_URL/items/lessons" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"unit_id\": $unit_id, \"lesson_index\": $lesson_idx, \"title\": \"课时${lesson_idx}\", \"description\": \"第${lesson_idx}课时\"}" > /dev/null
    count=$((count+1))
  done
  echo -n "$unit_id "
done
echo ""
echo "$count lessons created!"

# Get all lesson IDs and create 5 modules per lesson
echo "Creating 520 modules (5 per lesson)..."
LESSONS=$(curl -s "$DIRECTUS_URL/items/lessons?fields=id&sort=id&limit=200" \
  -H "Authorization: Bearer $TOKEN")

MODULE_NAMES=("玩一玩" "学一学" "想一想" "赏一赏" "唱一唱")
MODULE_TYPES=("情景导入" "探索发现" "游戏体验" "拓展延伸" "课程小结")

count=0
for lesson_id in $(echo $LESSONS | python3 -c "import sys,json; data=json.load(sys.stdin); print(' '.join([str(l['id']) for l in data['data']]))"); do
  for m in 0 1 2 3 4; do
    curl -s -X POST "$DIRECTUS_URL/items/lesson_modules" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"lesson_id\": $lesson_id, \"module_index\": $((m+1)), \"module_name\": \"${MODULE_NAMES[$m]}\", \"module_type\": \"${MODULE_TYPES[$m]}\"}" > /dev/null
    count=$((count+1))
  done
  echo -n "$lesson_id "
done
echo ""
echo "$count modules created!"

echo "Done!"
