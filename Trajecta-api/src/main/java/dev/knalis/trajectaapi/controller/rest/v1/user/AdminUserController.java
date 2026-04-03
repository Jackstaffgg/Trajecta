package dev.knalis.trajectaapi.controller.rest.v1.user;

import dev.knalis.trajectaapi.dto.user.UserCreateRequest;
import dev.knalis.trajectaapi.dto.common.ApiResponse;
import dev.knalis.trajectaapi.dto.user.UserResponse;
import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.mapper.UserMapper;
import dev.knalis.trajectaapi.model.User;
import dev.knalis.trajectaapi.service.intrf.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/users")
@RequiredArgsConstructor
@Tag(name = "Admin Users", description = "Administrative user management endpoints.")
@SecurityRequirement(name = "bearerAuth")
public class AdminUserController {
    
    private final UserService userService;
    private final UserMapper userMapper;
    
    @Operation(summary = "List all users", description = "Returns every user account. Intended for administrators.")
    @GetMapping
    public ResponseEntity<ApiResponse<List<UserResponse>>> getAllUsers() {
        return ResponseEntity.ok(ApiResponse.success(userMapper.toDtoList(userService.findAll())));
    }
    
    @Operation(summary = "Create user", description = "Creates a new user account with explicit role.")
    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createUser(@Valid @RequestBody UserCreateRequest request, Authentication auth) {
       return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(userMapper.toDto(userService.create(request, auth))));
    }
    
    @Operation(summary = "Update user by id", description = "Updates profile fields of a specific user account.")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> updateUser(@Parameter(description = "User identifier", example = "3") @PathVariable Long id, @Valid @RequestBody UserUpdateRequest request) {
        return ResponseEntity.ok(ApiResponse.success(userMapper.toDto(userService.update(id, request))));
    }
    
    @Operation(summary = "Delete user by id", description = "Deletes a user account by identifier.")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteUser(@Parameter(description = "User identifier", example = "3") @PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
    
    @Operation(summary = "Get user by id", description = "Returns a single user profile by identifier.")
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserById(@Parameter(description = "User identifier", example = "3") @PathVariable Long id) {
        User user = userService.findById(id);
        return ResponseEntity.ok(ApiResponse.success(userMapper.toDto(user)));
    }
}


