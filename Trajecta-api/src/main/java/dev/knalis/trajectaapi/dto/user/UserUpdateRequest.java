package dev.knalis.trajectaapi.dto.user;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import lombok.Data;


@Data
@Schema(description = "Payload for partial user profile updates.")
public class UserUpdateRequest {
    @Schema(description = "Display name.", example = "Jane Updated")
    @Size(min = 3, max = 30, message = "Name must be between 3 and 30 characters")
    private String name;
    
    @Schema(description = "Username.", example = "jane_updated")
    @Size(min = 3, max = 30, message = "Username must be between 3 and 30 characters")
    private String username;
    
    @Schema(description = "New password.", example = "NewStrongPass123")
    @Size(min = 8, message = "Password must be at least 8 characters long")
    private String password;
    
    @Schema(description = "Email address.", example = "jane.updated@example.com")
    @Email(message = "Email must be a valid email address")
    private String email;
    
    @Schema(description = "Role value.", allowableValues = {"ADMIN", "USER"}, example = "USER")
    @Pattern(
            regexp = "^(?i)(ADMIN|USER)$",
            message = "Role must be either 'ADMIN' or 'USER'"
    )
    private String role;
    
    
    @JsonIgnore
    @AssertTrue(message = "At least one field must be provided")
    public boolean isAtLeastOneFieldPresent() {
        return isNotBlank(name) ||
                isNotBlank(username) ||
                isNotBlank(password) ||
                isNotBlank(email) ||
                isNotBlank(role);
    }
    
    private boolean isNotBlank(String str) {
        return str != null && !str.trim().isEmpty();
    }
}


