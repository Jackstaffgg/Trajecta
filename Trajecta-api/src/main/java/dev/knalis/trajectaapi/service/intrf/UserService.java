package dev.knalis.trajectaapi.service.intrf;

import dev.knalis.trajectaapi.dto.auth.RegisterRequest;
import dev.knalis.trajectaapi.dto.user.UserCreateRequest;
import dev.knalis.trajectaapi.dto.user.UserResponse;
import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.model.User;
import org.springframework.security.core.Authentication;

import java.util.List;

/**
 * User account management service.
 */
public interface UserService {
    /** Registers a new self-service user account. */
    User register(RegisterRequest request);

    /** Creates a new user account by administrator. */
    User create(UserCreateRequest request, Authentication auth);

    /** Finds user by username. */
    User findByUsername(String username);

    /** Finds user by identifier. */
    User findById(long id);

    /** Finds user DTO by identifier. */
    UserResponse findResponseById(long id);

    /** Returns all users. */
    List<User> findAll();

    /** Returns all users as DTO view. */
    List<UserResponse> findAllResponses();

    /** Deletes user by identifier. */
    void delete(long id);

    /** Updates mutable fields of user profile. */
    User update(long id, UserUpdateRequest userUpdateRequest);

    /** Performs case-insensitive username search. */
    List<User> findByUsernameContaining(String username);
}


