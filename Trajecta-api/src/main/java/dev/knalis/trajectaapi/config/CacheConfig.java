package dev.knalis.trajectaapi.config;

import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Configuration
public class CacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory redisConnectionFactory) {
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(
                        GenericJacksonJsonRedisSerializer.builder().build()))
                .disableCachingNullValues()
                .entryTtl(Duration.ofMinutes(10));

        Map<String, RedisCacheConfiguration> cacheConfigs = new HashMap<>();
        cacheConfigs.put("usersById", defaultConfig.entryTtl(Duration.ofMinutes(30)));
        cacheConfigs.put("usersByUsername", defaultConfig.entryTtl(Duration.ofMinutes(30)));
        cacheConfigs.put("usersAll", defaultConfig.entryTtl(Duration.ofMinutes(10)));
        cacheConfigs.put("usersSearch", defaultConfig.entryTtl(Duration.ofMinutes(10)));

        cacheConfigs.put("notificationsByRecipient", defaultConfig.entryTtl(Duration.ofMinutes(5)));

        cacheConfigs.put("tasksById", defaultConfig.entryTtl(Duration.ofMinutes(5)));
        cacheConfigs.put("tasksByUserPage", defaultConfig.entryTtl(Duration.ofMinutes(2)));
        cacheConfigs.put("taskRawKey", defaultConfig.entryTtl(Duration.ofMinutes(10)));
        cacheConfigs.put("taskTrajectoryKey", defaultConfig.entryTtl(Duration.ofMinutes(10)));

        return RedisCacheManager.builder(redisConnectionFactory)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigs)
                .build();
    }
}
