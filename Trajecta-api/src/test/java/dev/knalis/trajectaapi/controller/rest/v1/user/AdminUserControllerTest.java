package dev.knalis.trajectaapi.controller.rest.v1.user;

import dev.knalis.trajectaapi.dto.user.UserCreateRequest;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminUserControllerTest {

    @Mock
    private UserService userService;
    @Mock
    private UserMapper userMapper;
    @Mock
    private Authentication authentication;

    private AdminUserController controller;

    @BeforeEach
    void setUp() {
        controller = new AdminUserController(userService, userMapper);
    }

    @Test
    void getAllUsers_returnsMappedList() {
        when(userService.findAll()).thenReturn(List.of(new User()));
        when(userMapper.toDtoList(anyList())).thenReturn(List.of(new UserResponse()));

        var response = controller.getAllUsers();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void createUser_returnsCreated() {
        UserCreateRequest req = new UserCreateRequest();
        User user = new User();
        UserResponse dto = new UserResponse();

        when(userService.create(req, authentication)).thenReturn(user);
        when(userMapper.toDto(user)).thenReturn(dto);

        var response = controller.createUser(req, authentication);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void deleteUser_delegates() {
        var response = controller.deleteUser(4L);

        verify(userService).delete(4L);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void updateUser_returnsMappedDto() {
        UserUpdateRequest req = new UserUpdateRequest();
        req.setName("Updated");
        User updated = new User();
        UserResponse dto = new UserResponse();
        dto.setName("Updated");

        when(userService.update(3L, req)).thenReturn(updated);
        when(userMapper.toDto(updated)).thenReturn(dto);

        var response = controller.updateUser(3L, req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getData().getName()).isEqualTo("Updated");
    }

    @Test
    void getUserById_returnsMappedDto() {
        User user = new User();
        user.setId(6L);
        UserResponse dto = new UserResponse();
        dto.setId(6L);

        when(userService.findById(6L)).thenReturn(user);
        when(userMapper.toDto(user)).thenReturn(dto);

        var response = controller.getUserById(6L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getData().getId()).isEqualTo(6L);
    }
}

