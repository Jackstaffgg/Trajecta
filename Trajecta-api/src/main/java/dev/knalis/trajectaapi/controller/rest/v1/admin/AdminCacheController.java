package dev.knalis.trajectaapi.controller.rest.v1.admin;

import dev.knalis.trajectaapi.dto.admin.CacheClearResponse;
import dev.knalis.trajectaapi.dto.admin.CacheHealthResponse;
import dev.knalis.trajectaapi.dto.common.ApiResponse;
import dev.knalis.trajectaapi.service.intrf.CacheAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/cache")
@RequiredArgsConstructor
@Tag(name = "Admin Cache", description = "Administrative cache maintenance endpoints.")
@SecurityRequirement(name = "bearerAuth")
public class AdminCacheController {

    private final CacheAdminService cacheAdminService;

    @Operation(summary = "Clear user caches", description = "Evicts user-related cache entries and refreshes user list/search caches.")
    @PostMapping("/users/{userId}/clear")
    public ResponseEntity<ApiResponse<CacheClearResponse>> clearUserCaches(
            @Parameter(description = "User identifier", example = "42") @PathVariable Long userId
    ) {
        return ResponseEntity.ok(ApiResponse.success(cacheAdminService.clearUserCaches(userId)));
    }

    @Operation(summary = "Cache health", description = "Returns Redis ping status for cache infrastructure.")
    @GetMapping("/health")
    public ResponseEntity<ApiResponse<CacheHealthResponse>> cacheHealth() {
        return ResponseEntity.ok(ApiResponse.success(cacheAdminService.cacheHealth()));
    }
}

