package dev.knalis.trajectaapi.service.intrf;

import dev.knalis.trajectaapi.dto.admin.CacheClearResponse;
import dev.knalis.trajectaapi.dto.admin.CacheHealthResponse;

public interface CacheAdminService {
    CacheClearResponse clearUserCaches(Long userId);

    CacheHealthResponse cacheHealth();
}

