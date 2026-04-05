package dev.knalis.trajectaapi.service.impl.cache;

import dev.knalis.trajectaapi.dto.admin.CacheClearResponse;
import dev.knalis.trajectaapi.dto.admin.CacheHealthResponse;
import dev.knalis.trajectaapi.repo.UserRepository;
import dev.knalis.trajectaapi.service.intrf.user.CacheAdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CacheAdminServiceImpl implements CacheAdminService {

    private final CacheManager cacheManager;
    private final UserRepository userRepository;
    private final RedisConnectionFactory redisConnectionFactory;

    @Override
    public CacheClearResponse clearUserCaches(Long userId) {
        if (userId == null) {
            return CacheClearResponse.builder()
                    .userId(null)
                    .userExists(false)
                    .usernameKeyEvicted(false)
                    .build();
        }

        var userOpt = userRepository.findById(userId);

        boolean usernameEvicted = false;
        if (userOpt.isPresent()) {
            String username = userOpt.get().getUsername();
            if (!username.isBlank()) {
                evict("notificationDtoByUser", username);
                usernameEvicted = true;
            }
        }

        return CacheClearResponse.builder()
                .userId(userId)
                .userExists(userOpt.isPresent())
                .usernameKeyEvicted(usernameEvicted)
                .build();
    }

    @Override
    public CacheHealthResponse cacheHealth() {
        try (RedisConnection connection = redisConnectionFactory.getConnection()) {
            String pong = connection.ping();
            if (pong == null || pong.isBlank()) {
                return CacheHealthResponse.builder()
                        .status("DOWN")
                        .redisPing("NONE")
                        .error("Redis ping returned empty response")
                        .build();
            }

            return CacheHealthResponse.builder()
                    .status("UP")
                    .redisPing(pong)
                    .error(null)
                    .build();
        } catch (Exception ex) {
            return CacheHealthResponse.builder()
                    .status("DOWN")
                    .redisPing("ERROR")
                    .error(ex.getMessage())
                    .build();
        }
    }

    private void evict(String cacheName, Object key) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null && key != null) {
            cache.evict(key);
        }
    }
}




