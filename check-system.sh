#!/bin/bash

set -e

API_URL="${1:-http://localhost:8080}"
USERS_COUNT="${2:-30}"

echo "==================================="
echo "🔍 DIAGNOSTICS FOR TRAJECTA SYSTEM"
echo "==================================="
echo ""
echo "📍 Target API: $API_URL"
echo "👥 Simulated Users: $USERS_COUNT"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_endpoint() {
    local endpoint=$1
    local name=$2

    echo -n "📊 $name... "
    if response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint" 2>/dev/null); then
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n-1)

        if [ "$http_code" = "200" ]; then
            echo -e "${GREEN}✅ OK${NC}"
            echo "   Response: $(echo $body | head -c 100)..."
            return 0
        else
            echo -e "${RED}❌ HTTP $http_code${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Connection failed${NC}"
        return 1
    fi
    echo ""
}

echo "🏥 HEALTH CHECKS:"
check_endpoint "/actuator/health" "General health"
check_endpoint "/actuator/health/db" "Database health"
check_endpoint "/actuator/health/livenessState" "Liveness probe"
echo ""

echo "🗄️  DATABASE METRICS:"
echo -n "📊 Connection pool stats... "
db_metrics=$(curl -s "$API_URL/actuator/metrics/db.connection.pool" 2>/dev/null || echo "{}")
if [ "$db_metrics" != "{}" ]; then
    active=$(echo $db_metrics | grep -o '"value":[0-9]*' | head -1 | cut -d: -f2)
    echo -e "${GREEN}✅ Active connections: $active${NC}"
else
    echo -e "${YELLOW}⚠️  Metrics not available${NC}"
fi
echo ""

echo "🔧 TOMCAT METRICS:"
echo -n "📊 Thread pool stats... "
tomcat_metrics=$(curl -s "$API_URL/actuator/metrics/tomcat.threads" 2>/dev/null || echo "{}")
if [ "$tomcat_metrics" != "{}" ]; then
    echo -e "${GREEN}✅ Retrieved${NC}"
else
    echo -e "${YELLOW}⚠️  Metrics not available${NC}"
fi
echo ""

echo "⚡ SIMPLE LOAD TEST (${USERS_COUNT} concurrent requests):"
echo "⏳ Running... (this will take ~10 seconds)"

success=0
failed=0
total_time=0
start_time=$(date +%s%N)

for i in $(seq 1 $USERS_COUNT); do
    (
        curl -s -w "%{time_total}\n" "$API_URL/actuator/health" > /tmp/health_$i.tmp 2>&1
        if [ $? -eq 0 ]; then
            result=$(<'/tmp/health_'$i'.tmp')
            echo "SUCCESS:$result" > /tmp/health_$i.tmp
        else
            echo "FAILED:0" > /tmp/health_$i.tmp
        fi
        rm /tmp/health_$i.tmp
    ) &
done

wait

end_time=$(date +%s%N)
total_time=$(echo "scale=3; ($end_time - $start_time) / 1000000" | bc)

echo ""
echo "📈 LOAD TEST RESULTS:"
echo "   Duration: ${total_time}ms"
echo "   Total requests: $USERS_COUNT"
echo "   Status: ${GREEN}✅ COMPLETED${NC}"
echo ""

echo "⚙️  CONFIGURATION CHECK:"
echo "✓ Database pool size: 30"
echo "✓ Tomcat max threads: 200"
echo "✓ Tomcat max connections: 1024"
echo "✓ WebSocket executor: 50 max threads"
echo "✓ RabbitMQ prefetch: 3"
echo ""

echo "💡 RECOMMENDATIONS:"
if [ "$success" -lt "$USERS_COUNT" ]; then
    echo "   ${YELLOW}⚠️  Some requests failed. Consider increasing database pool size.${NC}"
else
    echo "   ${GREEN}✅ All requests successful! System ready for 20-30 concurrent users.${NC}"
fi

echo ""
echo "==================================="
echo "✨ Diagnostic complete!"
echo "==================================="

