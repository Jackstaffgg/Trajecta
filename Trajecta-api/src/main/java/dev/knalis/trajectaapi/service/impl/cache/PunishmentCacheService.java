package dev.knalis.trajectaapi.service.impl.cache;

import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

@Service
public class PunishmentCacheService {

    private static final String BAN_FLAG_CACHE = "punishmentBanFlagByUserV1";

    private final CacheManager cacheManager;

    public PunishmentCacheService(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    public Boolean getBanFlag(long userId) {
        Cache cache = cacheManager.getCache(BAN_FLAG_CACHE);
        if (cache == null) {
            return null;
        }

        Cache.ValueWrapper wrapper = cache.get(userId);
        if (wrapper == null) {
            return null;
        }

        Object value = wrapper.get();
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        if (value instanceof String str) {
            if ("true".equalsIgnoreCase(str)) {
                return true;
            }
            if ("false".equalsIgnoreCase(str)) {
                return false;
            }
        }

        cache.evict(userId);
        return null;
    }

    public void putBanFlag(long userId, boolean isBanned) {
        Cache cache = cacheManager.getCache(BAN_FLAG_CACHE);
        if (cache != null) {
            cache.put(userId, isBanned);
        }
    }

    public void evictBanFlag(Long userId) {
        if (userId == null) {
            return;
        }
        Cache cache = cacheManager.getCache(BAN_FLAG_CACHE);
        if (cache != null) {
            cache.evict(userId);
        }
    }
}

