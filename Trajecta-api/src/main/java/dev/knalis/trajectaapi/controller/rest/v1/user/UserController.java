package dev.knalis.trajectaapi.controller.rest.v1.user;

import dev.knalis.trajectaapi.controller.rest.v1.support.CurrentUserResolver;
import dev.knalis.trajectaapi.dto.common.ApiResponse;
import dev.knalis.trajectaapi.dto.user.UserResponse;
import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.mapper.UserMapper;
import dev.knalis.trajectaapi.service.intrf.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "Current authenticated user profile endpoints.")
@SecurityRequirement(name = "bearerAuth")
public class UserController {
    
    private final UserService userService;
    private final UserMapper userMapper;
    private final CurrentUserResolver currentUserResolver;
    
    @Operation(summary = "Get current user profile", description = "Returns profile data of the authenticated user.")
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getCurrentUser(Authentication auth) {
        var currentUser = currentUserResolver.requireUser(auth);
        return ResponseEntity.ok(ApiResponse.success(userMapper.toDto(currentUser)));
    }
    
    @Operation(summary = "Update current user profile", description = "Updates mutable profile fields for the authenticated user.")
    @PutMapping
    public ResponseEntity<ApiResponse<UserResponse>> updateCurrentUser(@Valid @RequestBody UserUpdateRequest updateRequest, Authentication auth) {
        var currentUser = currentUserResolver.requireUser(auth);
        var updatedUser = userService.update(currentUser.getId(), updateRequest);
        return ResponseEntity.ok(ApiResponse.success(userMapper.toDto(updatedUser)));
    }
}


