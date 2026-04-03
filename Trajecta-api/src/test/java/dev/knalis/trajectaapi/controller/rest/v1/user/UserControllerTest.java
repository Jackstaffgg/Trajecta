package dev.knalis.trajectaapi.controller.rest.v1.user;

import dev.knalis.trajectaapi.controller.rest.v1.support.CurrentUserResolver;
import dev.knalis.trajectaapi.dto.user.UserResponse;
import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.mapper.UserMapper;
import dev.knalis.trajectaapi.model.User;
import dev.knalis.trajectaapi.service.intrf.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    @Mock
    private UserService userService;
    @Mock
    private UserMapper userMapper;
    @Mock
    private CurrentUserResolver currentUserResolver;
    @Mock
    private Authentication authentication;

    private UserController controller;

    @BeforeEach
    void setUp() {
        controller = new UserController(userService, userMapper, currentUserResolver);
    }

    @Test
    void getCurrentUser_returnsDto() {
        User user = new User();
        user.setId(1L);
        UserResponse dto = new UserResponse();
        dto.setId(1L);

        when(currentUserResolver.requireUser(authentication)).thenReturn(user);
        when(userMapper.toDto(user)).thenReturn(dto);

        var response = controller.getCurrentUser(authentication);

        assertThat(response.getBody().getData().getId()).isEqualTo(1L);
    }

    @Test
    void updateCurrentUser_returnsUpdatedUser() {
        User current = new User();
        current.setId(2L);
        UserUpdateRequest req = new UserUpdateRequest();
        req.setName("Updated");

        User updated = new User();
        updated.setId(2L);
        updated.setName("Updated");

        UserResponse dto = new UserResponse();
        dto.setId(2L);
        dto.setName("Updated");

        when(currentUserResolver.requireUser(authentication)).thenReturn(current);
        when(userService.update(2L, req)).thenReturn(updated);
        when(userMapper.toDto(updated)).thenReturn(dto);

        var response = controller.updateCurrentUser(req, authentication);

        assertThat(response.getBody().getData().getId()).isEqualTo(2L);
        assertThat(response.getBody().getData().getName()).isEqualTo("Updated");
    }
}

